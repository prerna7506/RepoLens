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
const queryRoutes = require('./routes/query');  // ← add this

const app = express();

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
app.use('/api/query', queryRoutes);  // ← add this

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.use(errorHandler);

module.exports = app;