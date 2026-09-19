const express = require('express');
const pool = require('../db/db_connection.js');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', postgres: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'down', postgres: 'down', error: err.message });
  }
});

module.exports = router;