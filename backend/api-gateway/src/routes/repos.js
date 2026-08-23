const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  createRepo,
  getRepo,
  listRepos,
  getTaskStatus,
  getRepoFiles,
  deleteRepo,
  reindexRepo
} = require('../controller/repoController');

router.post('/', requireAuth, createRepo);
router.get('/', requireAuth, listRepos);
router.get('/:id', requireAuth, getRepo);
router.get('/:id/files', requireAuth, getRepoFiles);
router.post('/:id/reindex', requireAuth, reindexRepo);
router.delete('/:id', requireAuth, deleteRepo);
router.get('/tasks/:taskId', requireAuth, getTaskStatus);

module.exports = router;