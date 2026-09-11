const express = require('express');
const router = express.Router();
const { handleWebhook } = require('../controller/webhookController');

router.post(
  '/github',
  express.raw({ type: 'application/json' }),
  handleWebhook
);

module.exports = router;