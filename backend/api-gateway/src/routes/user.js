const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { updateProfile } = require('../controller/userController');

const router = express.Router();

router.put('/profile', requireAuth, updateProfile);

module.exports = router;