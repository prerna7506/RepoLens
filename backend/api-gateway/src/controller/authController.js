const axios = require('axios');
const pool = require('../db/db_connection.js');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} = require('../utils/jwt');

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

function redirectToGithub(req, res) {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: process.env.GITHUB_CALLBACK_URL,
    scope: 'read:user, repo'
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
}

async function githubCallback(req, res, next) {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    const tokenResp = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code
      },
      { headers: { Accept: 'application/json' } }
    );

    const githubAccessToken = tokenResp.data.access_token;
    if (!githubAccessToken) {
      return res.status(401).json({ error: 'GitHub token exchange failed' });
    }

    const profileResp = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${githubAccessToken}` }
    });
    const { id: githubId, login: username, avatar_url, name, email } = profileResp.data;

    // GitHub's /user email can be null if private — fall back to /user/emails
    let resolvedEmail = email;
    if (!resolvedEmail) {
      try {
        const emailsResp = await axios.get('https://api.github.com/user/emails', {
          headers: { Authorization: `Bearer ${githubAccessToken}` }
        });
        const primary = emailsResp.data.find(e => e.primary) || emailsResp.data[0];
        resolvedEmail = primary?.email || null;
      } catch {
        resolvedEmail = null;
      }
    }

    const result = await pool.query(
      `INSERT INTO users (github_id, username, avatar_url, name, email)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (github_id)
       DO UPDATE SET username = $2, avatar_url = $3, name = $4, email = $5
       RETURNING id, username, avatar_url, name, email`,
      [String(githubId), username, avatar_url, name, resolvedEmail]
    );
    const user = result.rows[0];

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.cookie('refreshToken', refreshToken, COOKIE_OPTS);
    res.redirect(
      `${process.env.FRONTEND_URL}/auth/callback#access_token=${accessToken}`
    );
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res) {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).json({ error: 'No refresh token' });

  try {
    const payload = verifyRefreshToken(token);
    const result = await pool.query(
      'SELECT id, username FROM users WHERE id = $1',
      [payload.sub]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });

    const accessToken = signAccessToken(user);
    res.json({ accessToken });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
}

async function getMe(req, res) {
  try {
    const result = await pool.query(
      'SELECT id, username, name, email, avatar_url, github_id FROM users WHERE id = $1',
      [req.user.sub]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

function logout(req, res) {
  res.clearCookie('refreshToken', COOKIE_OPTS);
  res.status(204).send();
}

module.exports = { redirectToGithub, githubCallback, refresh, logout, getMe };