const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');
const { queryRepo, getHistory, getAllHistory, getQueryStats } = require('../controller/queryController');

router.post('/', requireAuth, queryRepo);

router.get('/history', requireAuth, getAllHistory);

router.get('/:repo_id/history', requireAuth, getHistory);
router.get('/stats', requireAuth, getQueryStats);
module.exports = router;