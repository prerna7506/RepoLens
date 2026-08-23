require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');
const { signAccessToken } = require('./src/utils/jwt');
const { io } = require('socket.io-client');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE_URL = 'http://localhost:3000';

let passed = 0;
let failed = 0;

function ok(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }

async function runTests() {
  console.log('\n========================================');
  console.log('       REPOLENS PHASE 4 TEST SUITE');
  console.log('========================================\n');

  let token, repoId;

  // Setup
  const userRes = await pool.query('SELECT id, username FROM users LIMIT 1');
  const user = userRes.rows[0];
  const repoRes = await pool.query(
    "SELECT id, github_url FROM repos WHERE status = 'completed' LIMIT 1"
  );
  const repo = repoRes.rows[0];
  token = signAccessToken(user);
  repoId = repo.id;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // ─────────────────────────────────────────
  console.log('1️⃣  GET /api/repos/:id/files');
  // ─────────────────────────────────────────
  try {
    const r = await axios.get(
      `${BASE_URL}/api/repos/${repoId}/files`,
      { headers }
    );
    ok(`Files endpoint works — ${r.data.files.length} files returned`);
    ok(`Sample: ${r.data.files[0]?.path}`);
  } catch (e) { fail(`Files endpoint failed: ${e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n2️⃣  POST /api/repos/:id/reindex');
  // ─────────────────────────────────────────
  try {
    const r = await axios.post(
      `${BASE_URL}/api/repos/${repoId}/reindex`,
      {},
      { headers }
    );
    ok(`Re-index triggered — task_id: ${r.data.task_id}`);
  } catch (e) { fail(`Re-index failed: ${e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n3️⃣  SOCKET.IO CONNECTION + JWT AUTH');
  // ─────────────────────────────────────────
  await new Promise((resolve) => {
    const socket = io(BASE_URL, {
      auth: { token },
      transports: ['websocket']
    });

    socket.on('connect', () => {
      ok(`Socket connected — ID: ${socket.id}`);
      socket.disconnect();
      resolve(null);
    });

    socket.on('connect_error', (err) => {
      fail(`Socket connection failed: ${err.message}`);
      resolve(null);
    });

    setTimeout(() => {
      fail('Socket connection timed out');
      resolve(null);
    }, 5000);
  });

  // ─────────────────────────────────────────
  console.log('\n4️⃣  SOCKET.IO JOIN REPO + BROADCAST');
  // ─────────────────────────────────────────
  await new Promise((resolve) => {
    const socket1 = io(BASE_URL, { auth: { token }, transports: ['websocket'] });
    const socket2 = io(BASE_URL, { auth: { token }, transports: ['websocket'] });

    let socket1Ready = false;
    let socket2Ready = false;

    socket1.on('connect', () => {
      socket1Ready = true;
      socket1.emit('join:repo', repoId);
      if (socket2Ready) sendTest();
    });

    socket2.on('connect', () => {
      socket2Ready = true;
      socket2.emit('join:repo', repoId);
      if (socket1Ready) sendTest();
    });

    socket2.on('query:shared', (data) => {
      ok(`Real-time broadcast works — received: "${data.question}"`);
      socket1.disconnect();
      socket2.disconnect();
      resolve(null);
    });

    function sendTest() {
      setTimeout(() => {
        socket1.emit('query:new', {
          question: 'Test question',
          answer: 'Test answer',
          citations: []
        });
      }, 500);
    }

    setTimeout(() => {
      fail('Socket broadcast timed out');
      socket1.disconnect();
      socket2.disconnect();
      resolve(null);
    }, 8000);
  });

  // ─────────────────────────────────────────
  console.log('\n5️⃣  QUERY HISTORY ENDPOINT');
  // ─────────────────────────────────────────
  try {
    const r = await axios.get(
      `${BASE_URL}/api/query/${repoId}/history`,
      { headers }
    );
    ok(`Query history — ${r.data.queries.length} past queries`);
  } catch (e) { fail(`History endpoint failed: ${e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n6️⃣  DELETE /api/repos/:id (creates temp repo first)');
  // ─────────────────────────────────────────
  try {
    const createRes = await axios.post(
      `${BASE_URL}/api/repos`,
      { github_url: 'https://github.com/expressjs/express' },
      { headers }
    );
    const tempId = createRes.data.repo.id;
    await axios.delete(`${BASE_URL}/api/repos/${tempId}`, { headers });
    const check = await pool.query(
      'SELECT id FROM repos WHERE id = $1', [tempId]
    );
    if (check.rows.length === 0) {
      ok('Delete repo works — repo removed from DB');
    } else {
      fail('Delete repo failed — repo still in DB');
    }
  } catch (e) { fail(`Delete repo failed: ${e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n========================================');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();