const pool = require('../db/db_connection.js');

async function updateProfile(req, res) {
  const { name, username, email } = req.body;
  const userId = req.user.id;

  if (!name || !username || !email) {
    return res.status(400).json({ message: 'name, username, and email are required' });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET name = $1, username = $2, email = $3 WHERE id = $4 RETURNING id, username, name, email, avatar_url, github_id`,
      [name, username, email, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') { // unique_violation, e.g. username/email already taken
      return res.status(409).json({ message: 'Username or email already in use' });
    }
    res.status(500).json({ message: 'Could not update profile' });
  }
}

module.exports = { updateProfile };