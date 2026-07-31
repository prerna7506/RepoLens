require('dotenv').config();
const { signAccessToken } = require('./src/utils/jwt');
const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
  try {
    // Step 1 — Get real user from DB
    const result = await pool.query(
      'SELECT id, username FROM users LIMIT 1'
    );
    const user = result.rows[0];
    if (!user) {
      console.error('❌ No user found — login with GitHub first');
      process.exit(1);
    }
    console.log('✅ Found user:', user.username);

    // Step 2 — Generate access token
    const token = signAccessToken(user);
    console.log('✅ Token generated');

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // Step 3 — Call POST /api/repos
    const { data } = await axios.post(
      'http://localhost:3000/api/repos',
      { github_url: 'https://github.com/expressjs/express' },
      { headers }
    );

    console.log('✅ Repo created successfully!');
    console.log('   Repo ID  :', data.repo.id);
    console.log('   Status   :', data.repo.status);
    console.log('   Task ID  :', data.task_id);

    // Step 4 — Poll task status every 3 seconds
    console.log('\n⏳ Polling task status...\n');
    let completed = false;
    let attempts = 0;

    while (!completed && attempts < 20) {
      await new Promise(r => setTimeout(r, 3000));
      attempts++;

      const { data: taskData } = await axios.get(
        `http://localhost:3000/api/repos/tasks/${data.task_id}`,
        { headers }
      );
      console.log(`   [${attempts}] State: ${taskData.state}`);

      if (taskData.state === 'SUCCESS') {
        console.log('\n✅ Ingestion completed!');
        console.log('   Result:', JSON.stringify(taskData.result, null, 2));
        completed = true;
      } else if (taskData.state === 'FAILURE') {
        console.error('\n❌ Ingestion failed:', taskData.result);
        completed = true;
      }
    }

    if (!completed) {
      console.log('\n⚠️ Still running — check Celery terminal for progress');
    }

  } catch (err) {
    console.error('❌ Error:', err.response?.data || err.message);
  } finally {
    await pool.end();
  }
}

test();