const axios = require('axios');
const pool = require('../db/db_connection');
const { logger } = require('../utils/logger');

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8000';

function isValidGithubUrl(url) {
  return /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/.test(url);
}

async function createRepo(req, res, next) {
  try {
    const { github_url } = req.body;
    const userId = req.user.id;

    if (!github_url) {
      return res.status(400).json({ error: 'github_url is required' });
    }
    if (!isValidGithubUrl(github_url)) {
      return res.status(400).json({ error: 'Invalid GitHub URL' });
    }

    const cloneUrl = github_url.endsWith('.git')
      ? github_url
      : `${github_url}.git`;

    // Check if repo already exists for this user
    const existing = await pool.query(
      `SELECT id, status FROM repos 
       WHERE user_id = $1 
       AND (github_url = $2 OR clone_url = $3)
       LIMIT 1`,
      [userId, github_url, cloneUrl]
    );

    if (existing.rows[0]) {
      const { status, id } = existing.rows[0];

      // If failed → auto retry
      if (status === 'failed') {
        const workerResponse = await axios.post(`${WORKER_URL}/ingest`, {
          repo_id: id,
          clone_url: cloneUrl
        });
        const taskId = workerResponse.data.task_id;
        await pool.query(
          'UPDATE repos SET status = $1, task_id = $2 WHERE id = $3',
          ['queued', taskId, id]
        );
        const result = await pool.query(
          'SELECT id, github_url, status, task_id FROM repos WHERE id = $1',
          [id]
        );
        return res.status(200).json({
          repo: result.rows[0],
          task_id: taskId,
          retried: true
        });
      }

      // If completed → block
      if (status === 'completed') {
        return res.status(400).json({
          error: 'Repo already indexed. Use the Re-index button instead.'
        });
      }

      // If still processing → block
      return res.status(400).json({
        error: `Repo is currently being processed (${status})`
      });
    }

    // Insert new repo
    const result = await pool.query(
      `INSERT INTO repos (user_id, github_url, clone_url, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, github_url, status`,
      [userId, github_url, cloneUrl]
    );
    const repo = result.rows[0];

    const workerResponse = await axios.post(`${WORKER_URL}/ingest`, {
      repo_id: repo.id,
      clone_url: cloneUrl
    });
    const taskId = workerResponse.data.task_id;

    // ✅ save task_id
    await pool.query(
      'UPDATE repos SET status = $1, task_id = $2 WHERE id = $3',
      ['queued', taskId, repo.id]
    );

    res.status(201).json({
      repo: { id: repo.id, github_url: repo.github_url, status: 'queued' },
      task_id: taskId
    });

  } catch (err) {
    next(err);
  }
}

async function listRepos(req, res, next) {
  try {
    // NOTE: added the same LEFT JOIN + COUNT that getRepo() already uses,
    // so file_count is populated in the list view too (dashboard cards and
    // the chat composer's "Index loaded for ... (N files)" line both read
    // this field and were previously always getting undefined here).
    const result = await pool.query(
      `SELECT r.id, r.github_url, r.status, r.task_id, r.created_at,
              r.last_indexed_commit, COUNT(f.id) as file_count
       FROM repos r
       LEFT JOIN files f ON f.repo_id = r.id
       WHERE r.user_id = $1
       GROUP BY r.id
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json({ repos: result.rows });
  } catch (err) {
    next(err);
  }
}

async function getRepo(req, res, next) {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT r.id, r.github_url, r.status, r.task_id, r.created_at, r.updated_at,
              r.last_indexed_commit, COUNT(f.id) as file_count
      FROM repos r
      LEFT JOIN files f ON f.repo_id = r.id
      WHERE r.user_id = $1
      GROUP BY r.id
      ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Repo not found' });
    }
    res.json({ repo: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function getTaskStatus(req, res, next) {
  try {
    const { taskId } = req.params;
    const response = await axios.get(`${WORKER_URL}/tasks/${taskId}`);
    res.json(response.data);
  } catch (err) {
    next(err);
  }
}

async function getRepoFiles(req, res, next) {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT path, language, index_status, size_bytes
       FROM files
       WHERE repo_id = $1
       ORDER BY path ASC`,
      [id]
    );
    res.json({ files: result.rows });
  } catch (err) {
    next(err);
  }
}

async function getFileContent(req, res, next) {
  try {
    const { id } = req.params;
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({ error: 'path query parameter is required' });
    }
    if (filePath.includes('..')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const result = await pool.query(
      `SELECT github_url, last_indexed_commit FROM repos WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Repo not found' });
    }

    const { github_url, last_indexed_commit } = result.rows[0];
    const match = github_url.match(/github\.com\/([\w.-]+)\/([\w.-]+?)(\.git)?$/);
    if (!match) {
      return res.status(400).json({ error: 'Could not parse GitHub URL' });
    }
    const [, owner, repoName] = match;
    const ref = last_indexed_commit || 'HEAD';

    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repoName}/${ref}/${encodedPath}`;

    const response = await axios.get(rawUrl, {
      // Force plain text — otherwise axios will JSON.parse files like
      // package.json into an object instead of returning a string.
      transformResponse: (data) => data
    });

    res.json({ content: response.data });
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return res.status(404).json({ error: 'File not found in repository at the indexed commit' });
    }
    next(err);
  }
}

async function deleteRepo(req, res, next) {
  try {
    const { id } = req.params;
    await pool.query(
      'DELETE FROM repos WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function reindexRepo(req, res, next) {
  try {
    const { id } = req.params;

    // ✅ use correct variable names
    const result = await pool.query(
      'SELECT clone_url FROM repos WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Repo not found' });
    }

    const { clone_url } = result.rows[0];
    const workerResponse = await axios.post(
      `${WORKER_URL}/ingest`,
      { repo_id: id, clone_url }
    );

    const taskId = workerResponse.data.task_id; // ✅ correct variable

    await pool.query(
      'UPDATE repos SET status = $1, task_id = $2 WHERE id = $3',
      ['queued', taskId, id] // ✅ use id not repo.id
    );

    res.json({ task_id: taskId });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createRepo, getRepo, listRepos,
  getTaskStatus, getRepoFiles, getFileContent,
  deleteRepo, reindexRepo
};