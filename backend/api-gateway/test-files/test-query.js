require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');
const { signAccessToken } = require('./src/utils/jwt'); // Adjust path if needed

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
  try {
    // ─── 1. Validate prerequisites ─────────────────────────
    const userRes = await pool.query('SELECT id, username FROM users LIMIT 1');
    if (userRes.rows.length === 0) {
      console.error('❌ No users found — run GitHub OAuth login first');
      process.exit(1);
    }
    const user = userRes.rows[0];

    const repoRes = await pool.query(
      "SELECT id, github_url FROM repos WHERE status = 'completed' LIMIT 1"
    );
    if (repoRes.rows.length === 0) {
      console.error('❌ No completed repo found — run Phase 2 ingestion first');
      process.exit(1);
    }
    const repo = repoRes.rows[0];

    const token = signAccessToken(user);
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    console.log(`\n👤 User: ${user.username} (${user.id})`);
    console.log(`📁 Repo: ${repo.github_url} (${repo.id})`);
    console.log(`❓ Question: "How does work in this codebase?"\n`);

    // ─── 2. Call /api/query ────────────────────────────────
    const { data } = await axios.post(
      'http://localhost:3000/api/query',
      {
        question: 'How does work in this codebase?',
        repo_id: repo.id
      },
      { headers, timeout: 30000 } // 30s timeout
    );

    // ─── 3. Validate response ─────────────────────────────
    if (!data.answer) {
      console.error('❌ Invalid response: missing answer field');
      console.log(data);
      process.exit(1);
    }

    console.log('✅ Answer:');
    console.log(data.answer);

    if (data.citations && data.citations.length > 0) {
      console.log('\n📎 Citations:');
      data.citations.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.file} (lines ${c.startLine}-${c.endLine})`);
        if (c.summary) console.log(`     ${c.summary}`);
      });
    } else {
      console.log('\n⚠️  No citations returned');
    }

    console.log('\n✅ Test passed!');

  } catch (err) {
    if (err.response) {
      console.error(`❌ API Error ${err.response.status}:`, err.response.data);
    } else if (err.code === 'ECONNREFUSED') {
      console.error('❌ Cannot connect to API — is the server running on :3000?');
    } else {
      console.error('❌ Error:', err.message);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

test();