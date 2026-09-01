require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const { requestLogger } = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { requireAuth } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const healthRoutes = require('./routes/health');
const repoRoutes = require('./routes/repos');
const queryRoutes = require('./routes/query');
const webhookRoutes = require('./routes/webhooks');
const pool = require('./db/db_connection.js'); 
const app = express();

// Webhook route MUST come before express.json()
// Raw body is needed for signature verification
app.use('/webhooks', webhookRoutes);

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4200',
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

app.use('/health', healthRoutes);
app.use('/auth', authRoutes);
app.use('/api/repos', repoRoutes);
app.use('/api/query', queryRoutes);

app.get('/api/me', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, username, name, email, avatar_url, github_id FROM users WHERE id = $1',
      [req.user.id]   // was req.user.sub
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    next(err);
  }
});
app.use(errorHandler);

module.exports = app;