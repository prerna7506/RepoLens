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

    const result = await pool.query(
      `INSERT INTO repos (user_id, github_url, clone_url, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, github_url, status`,
      [userId, github_url, cloneUrl]
    );
    const repo = result.rows[0];

    // Call FastAPI /ingest to trigger Celery task
    const workerResponse = await axios.post(`${WORKER_URL}/ingest`, {
      repo_id: repo.id,
      clone_url: cloneUrl
    });

    const taskId = workerResponse.data.task_id;

    await pool.query(
      'UPDATE repos SET status = $1 WHERE id = $2',
      ['queued', repo.id]
    );

    logger.info('repo_created', { repo_id: repo.id, task_id: taskId });

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
    const result = await pool.query(
      `SELECT id, github_url, status, created_at, last_indexed_commit
       FROM repos WHERE user_id = $1
       ORDER BY created_at DESC`,
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
      `SELECT r.id, r.github_url, r.status, r.created_at,
              r.last_indexed_commit, COUNT(f.id) as file_count
       FROM repos r
       LEFT JOIN files f ON f.repo_id = r.id
       WHERE r.id = $1 AND r.user_id = $2
       GROUP BY r.id`,
      [id, req.user.id]
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

module.exports = { createRepo, getRepo, listRepos, getTaskStatus };