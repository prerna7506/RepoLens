const crypto = require('crypto');
const axios = require('axios');
const pool = require('../db/db_connection');
const { logger } = require('../utils/logger');

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8000';
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';

function verifySignature(rawBody, signature) {
  if (!WEBHOOK_SECRET) return true; // skip in dev if no secret set
  const expected = `sha256=${crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex')}`;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

async function handleWebhook(req, res) {
  try {
    const signature = req.headers['x-hub-signature-256'] || '';
    const rawBody = req.body;

    if (!verifySignature(rawBody, signature)) {
      logger.warn('webhook_invalid_signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.headers['x-github-event'];
    if (event !== 'push') {
      return res.status(200).json({ message: `Ignoring event: ${event}` });
    }

    const payload = JSON.parse(rawBody.toString());
    const cloneUrl = payload.repository?.clone_url;

    if (!cloneUrl) {
      return res.status(400).json({ error: 'No clone_url in payload' });
    }

    // Find repo in our DB by clone URL
    const repoResult = await pool.query(
      'SELECT id FROM repos WHERE clone_url = $1 LIMIT 1',
      [cloneUrl]
    );

    if (!repoResult.rows[0]) {
      logger.info('webhook_repo_not_found', { cloneUrl });
      return res.status(200).json({ message: 'Repo not tracked' });
    }

    const repoId = repoResult.rows[0].id;

    // Extract changed files from all commits
    const changedFiles = [
      ...new Set([
        ...payload.commits.flatMap(c => c.modified || []),
        ...payload.commits.flatMap(c => c.added || []),
      ])
    ];

    const removedFiles = [
      ...new Set(payload.commits.flatMap(c => c.removed || []))
    ];

    logger.info('webhook_received', {
      repoId,
      changed: changedFiles.length,
      removed: removedFiles.length
    });

    // Delete removed files from DB
    for (const filePath of removedFiles) {
      await pool.query(
        'DELETE FROM files WHERE repo_id = $1 AND path = $2',
        [repoId, filePath]
      );
    }

    // Trigger delta re-index for changed/added files
    if (changedFiles.length > 0) {
      const workerResponse = await axios.post(`${WORKER_URL}/ingest`, {
        repo_id: repoId,
        clone_url: cloneUrl,
        changed_files: changedFiles
      });

      await pool.query(
        'UPDATE repos SET status = $1 WHERE id = $2',
        ['queued', repoId]
      );

      logger.info('delta_reindex_triggered', {
        repoId,
        task_id: workerResponse.data.task_id
      });
    }

    res.status(200).json({
      message: 'Webhook processed',
      changed: changedFiles.length,
      removed: removedFiles.length
    });

  } catch (err) {
    logger.error('webhook_error', { error: err.message });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

module.exports = { handleWebhook };