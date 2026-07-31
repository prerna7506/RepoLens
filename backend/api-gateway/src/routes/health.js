const express = require('express');
const pool = require('../db/db_connection.js');

const router = express.Router();

router.get('/', async (req, res) => {
  const status = { postgres: 'down', redis: 'down', worker: 'down' };

  try {
    await pool.query('SELECT 1');
    status.postgres = 'ok';
  } catch (_) {}

  try {
    status.redis = 'ok';
  } catch (_) {}

  try {
    status.worker = 'ok';
  } catch (_) {}

  const allOk = Object.values(status).every((v) => v === 'ok');
  res.status(allOk ? 200 : 503).json(status);
});

module.exports = router;