require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');
const { signAccessToken } = require('./src/utils/jwt');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE_URL = 'http://localhost:3000';

let passed = 0;
let failed = 0;

function ok(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }

async function runTests() {
  console.log('\n========================================');
  console.log('       REPOLENS PHASE 3 TEST SUITE');
  console.log('========================================\n');

  let token, repoId;

  // ─────────────────────────────────────────
  console.log('1️⃣  GET USER + COMPLETED REPO');
  // ─────────────────────────────────────────
  try {
    const userRes = await pool.query('SELECT id, username FROM users LIMIT 1');
    const user = userRes.rows[0];
    const repoRes = await pool.query(
      "SELECT id, github_url FROM repos WHERE status = 'completed' LIMIT 1"
    );
    const repo = repoRes.rows[0];

    if (!user) { fail('No user found'); return; }
    if (!repo) { fail('No completed repo — run Phase 2 first'); return; }

    token = signAccessToken(user);
    repoId = repo.id;

    ok(`User: ${user.username}`);
    ok(`Repo: ${repo.github_url}`);
  } catch (e) { fail(e.message); return; }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // ─────────────────────────────────────────
  console.log('\n2️⃣  EMBED ENDPOINT (FastAPI)');
  // ─────────────────────────────────────────
  try {
    const r = await axios.post(
      'http://localhost:8000/embed',
      { text: 'How does routing work?' },
      { timeout: 60000 }
    );
    const emb = r.data.embedding;
    if (emb && emb.length === 384) {
      ok(`Embedding generated — 384 dimensions`);
    } else {
      fail(`Wrong embedding dimensions: ${emb?.length}`);
    }
  } catch (e) { fail(`Embed endpoint failed: ${e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n3️⃣  VECTOR SEARCH (pgvector)');
  // ─────────────────────────────────────────
  try {
    const embedRes = await axios.post(
      'http://localhost:8000/embed',
      { text: 'routing middleware' },
      { timeout: 60000 }
    );
    const vectorStr = `[${embedRes.data.embedding.join(',')}]`;
    const r = await pool.query(
      `SELECT c.id, c.name, f.path,
              e.embedding <=> $1 AS distance
       FROM embeddings e
       JOIN chunks c ON c.id = e.chunk_id
       JOIN files f ON f.id = c.file_id
       WHERE f.repo_id = $2
       ORDER BY distance ASC LIMIT 5`,
      [vectorStr, repoId]
    );
    ok(`Vector search returned ${r.rows.length} results`);
    ok(`Top result: ${r.rows[0]?.path} — ${r.rows[0]?.name}`);
  } catch (e) { fail(`Vector search failed: ${e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n4️⃣  FULL-TEXT SEARCH (tsvector)');
  // ─────────────────────────────────────────
  try {
    const r = await pool.query(
      `SELECT c.id, c.name, f.path
       FROM chunks c
       JOIN files f ON f.id = c.file_id
       WHERE f.repo_id = $1
         AND c.content_tsv @@ websearch_to_tsquery('english', $2)
       LIMIT 5`,
      [repoId, 'router middleware']
    );
    ok(`Full-text search returned ${r.rows.length} results`);
    if (r.rows[0]) ok(`Top result: ${r.rows[0].path}`);
  } catch (e) { fail(`Full-text search failed: ${e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n5️⃣  POST /api/query — FULL RAG PIPELINE');
  // ─────────────────────────────────────────
  console.log('  ⏳ Calling HuggingFace LLM (may take 20-30s)...');
  try {
    const r = await axios.post(
      `${BASE_URL}/api/query`,
      {
        question: 'How does routing work in this codebase?',
        repo_id: repoId
      },
      { headers, timeout: 120000 }
    );
    ok(`Answer received (${r.data.answer.length} chars)`);
    ok(`Citations: ${r.data.citations.length} sources`);
    r.data.citations.slice(0, 3).forEach((c, i) => {
      ok(`  [${i+1}] ${c.file} lines ${c.startLine}-${c.endLine}`);
    });
  } catch (e) { fail(`RAG query failed: ${e.response?.data?.error || e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n6️⃣  GET /api/query/:repo_id/history');
  // ─────────────────────────────────────────
  try {
    const r = await axios.get(
      `${BASE_URL}/api/query/${repoId}/history`,
      { headers }
    );
    ok(`Query history: ${r.data.queries.length} past queries`);
    if (r.data.queries[0]) {
      ok(`Latest: "${r.data.queries[0].question.substring(0, 50)}..."`);
    }
  } catch (e) { fail(`History failed: ${e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n7️⃣  VERIFY QUERIES STORED IN SUPABASE');
  // ─────────────────────────────────────────
  try {
    const r = await pool.query(
      'SELECT COUNT(*) FROM queries WHERE repo_id = $1',
      [repoId]
    );
    ok(`Queries stored in DB: ${r.rows[0].count}`);
  } catch (e) { fail(`Queries check failed: ${e.message}`); }

  // ─────────────────────────────────────────
  console.log('\n========================================');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();