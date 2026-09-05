require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');
const { signAccessToken } = require('./src/utils/jwt');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE_URL = 'http://localhost:3000';
const WORKER_URL = 'http://localhost:8000';

let passed = 0;
let failed = 0;

function ok(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }

async function runTests() {
  console.log('\n========================================');
  console.log('       REPOLENS PHASE 2 TEST SUITE');
  console.log('========================================\n');

  let token, repoId, taskId;

  // ─────────────────────────────────────────
  console.log('1️⃣  DATABASE CONNECTION');
  // ─────────────────────────────────────────
  try {
    const r = await pool.query('SELECT NOW()');
    ok(`Supabase connected: ${r.rows[0].now}`);
  } catch (e) { fail(`Supabase connection failed: ${e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n2️⃣  USER EXISTS IN DB');
  // ─────────────────────────────────────────
  let user;
  try {
    const r = await pool.query('SELECT id, username FROM users LIMIT 1');
    user = r.rows[0];
    if (user) ok(`User found: ${user.username}`);
    else fail('No user found — login with GitHub first');
  } catch (e) { fail(`User query failed: ${e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n3️⃣  JWT TOKEN GENERATION');
  // ─────────────────────────────────────────
  try {
    token = signAccessToken(user);
    ok('Access token generated');
  } catch (e) { fail(`JWT generation failed: ${e.message}`); }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // ─────────────────────────────────────────
  console.log('\n4️⃣  EXPRESS HEALTH CHECK');
  // ─────────────────────────────────────────
  try {
    const r = await axios.get(`${BASE_URL}/health`);
    ok(`Express running — postgres: ${r.data.postgres}, redis: ${r.data.redis}`);
  } catch (e) { fail(`Express health failed: ${e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n5️⃣  FASTAPI WORKER HEALTH CHECK');
  // ─────────────────────────────────────────
  try {
    const r = await axios.get(`${WORKER_URL}/health`);
    ok(`FastAPI running — postgres: ${r.data.postgres}, redis: ${r.data.redis}`);
  } catch (e) { fail(`FastAPI health failed: ${e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n6️⃣  POST /api/repos — CREATE REPO');
  // ─────────────────────────────────────────
  try {
    const r = await axios.post(
      `${BASE_URL}/api/repos`,
      { github_url: 'https://github.com/expressjs/express' },
      { headers }
    );
    repoId = r.data.repo.id;
    taskId = r.data.task_id;
    ok(`Repo created — ID: ${repoId}`);
    ok(`Task queued — Task ID: ${taskId}`);
  } catch (e) { fail(`POST /api/repos failed: ${e.response?.data?.error || e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n7️⃣  GET /api/repos — LIST REPOS');
  // ─────────────────────────────────────────
  try {
    const r = await axios.get(`${BASE_URL}/api/repos`, { headers });
    ok(`Listed ${r.data.repos.length} repo(s) for user`);
  } catch (e) { fail(`GET /api/repos failed: ${e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n8️⃣  GET /api/repos/:id — GET SINGLE REPO');
  // ─────────────────────────────────────────
  try {
    const r = await axios.get(`${BASE_URL}/api/repos/${repoId}`, { headers });
    ok(`Repo fetched — status: ${r.data.repo.status}`);
  } catch (e) { fail(`GET /api/repos/:id failed: ${e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n9️⃣  POLL TASK STATUS (max 5 mins)');
  // ─────────────────────────────────────────
  console.log('  ⏳ Waiting for Celery worker to process...\n');
  let completed = false;
  let attempts = 0;

  while (!completed && attempts < 60) {
    await new Promise(r => setTimeout(r, 5000));
    attempts++;

    try {
      const r = await axios.get(
        `${BASE_URL}/api/repos/tasks/${taskId}`,
        { headers }
      );
      const state = r.data.state;
      process.stdout.write(`  [${attempts}] State: ${state}\r`);

      if (state === 'SUCCESS') {
        console.log('');
        ok(`Ingestion completed — chunks: ${r.data.result?.chunks}`);
        completed = true;
      } else if (state === 'FAILURE') {
        console.log('');
        fail(`Ingestion failed: ${r.data.result}`);
        completed = true;
      }
    } catch (e) {
      fail(`Task status check failed: ${e.message}`);
      completed = true;
    }
  }

  if (!completed) {
    fail('Timed out waiting for ingestion — check Celery terminal');
  }

  // ─────────────────────────────────────────
  console.log('\n🔟  VERIFY DATA IN SUPABASE');
  // ─────────────────────────────────────────
  try {
    const repos = await pool.query(
      'SELECT COUNT(*) FROM repos WHERE status = $1', ['completed']
    );
    ok(`Completed repos in DB: ${repos.rows[0].count}`);
  } catch (e) { fail(`Repos check failed: ${e.message}`); }

  try {
    const files = await pool.query('SELECT COUNT(*) FROM files');
    ok(`Files indexed: ${files.rows[0].count}`);
  } catch (e) { fail(`Files check failed: ${e.message}`); }

  try {
    const chunks = await pool.query('SELECT COUNT(*) FROM chunks');
    ok(`Chunks stored: ${chunks.rows[0].count}`);
  } catch (e) { fail(`Chunks check failed: ${e.message}`); }

  try {
    const embeddings = await pool.query('SELECT COUNT(*) FROM embeddings');
    ok(`Embeddings stored: ${embeddings.rows[0].count}`);
  } catch (e) { fail(`Embeddings check failed: ${e.message}`); }

  try {
    const sample = await pool.query(
      'SELECT chunk_id, model_name FROM embeddings LIMIT 1'
    );
    if (sample.rows[0]) {
      ok(`Embedding model used: ${sample.rows[0].model_name}`);
    }
  } catch (e) { fail(`Embeddings sample check failed: ${e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n========================================');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();