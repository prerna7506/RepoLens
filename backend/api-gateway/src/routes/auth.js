const express = require('express');
const {
  redirectToGithub,
  githubCallback,
  refresh,
  logout
} = require('../controller/authController');

const router = express.Router();

router.get('/github', redirectToGithub);
router.get('/github/callback', githubCallback);
router.post('/refresh', refresh);
router.post('/logout', logout);

module.exports = router;