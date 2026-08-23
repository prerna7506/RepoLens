const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');
const { queryRepo, getHistory } = require('../controller/queryController');

router.post('/', requireAuth, queryRepo);
router.get('/:repo_id/history', requireAuth, getHistory);

module.exports = router;