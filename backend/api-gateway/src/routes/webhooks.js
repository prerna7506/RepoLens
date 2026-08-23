const express = require('express');
const router = express.Router();
const { handleWebhook } = require('../controller/webhookController');

// Raw body needed for signature verification — must come BEFORE express.json()
router.post(
  '/github',
  express.raw({ type: 'application/json' }),
  handleWebhook
);

module.exports = router;