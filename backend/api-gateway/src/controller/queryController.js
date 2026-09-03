const { OpenAI } = require('openai');
const pool = require('../db/db_connection');
const { logger } = require('../utils/logger');
const { get_encoding } = require('tiktoken');
const axios = require('axios');

// ─── GROQ CLIENT (OpenAI-compatible) ─────────────────────
const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1'
});

const enc = get_encoding('cl100k_base');

function trimToContextLimit(chunks, question, limit = 2500) {
    let tokens = enc.encode(question).length;
    const kept = [];
    for (const chunk of chunks) {
        const t = enc.encode(chunk.content).length;
        if (tokens + t > limit) break;
        kept.push(chunk);
        tokens += t;
    }
    return kept;
}

// ─── Reciprocal Rank Fusion ───────────────────────────────
function reciprocalRankFusion(vectorResults, textResults, k = 60) {
    const scores = {};
    const lookup = {};

    vectorResults.forEach((r, i) => {
        scores[r.chunk_id] = (scores[r.chunk_id] || 0) + 1 / (k + i + 1);
        lookup[r.chunk_id] = r;
    });

    textResults.forEach((r, i) => {
        scores[r.chunk_id] = (scores[r.chunk_id] || 0) + 1 / (k + i + 1);
        lookup[r.chunk_id] = lookup[r.chunk_id] || r;
    });

    return Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id]) => lookup[id]);
}

// ─── Parse LLM response safely ────────────────────────────
function parseLLMResponse(raw) {
    // Strip <think>...</think> reasoning blocks
    raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // Strip markdown code blocks
    raw = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Extract JSON object
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
    }

    return JSON.parse(jsonMatch[0]);
}

// ─── POST /api/query ──────────────────────────────────────
async function queryRepo(req, res, next) {
    try {
        const { question, repo_id } = req.body;
        const userId = req.user.id;

        if (!question || !repo_id) {
            return res.status(400).json({
                error: 'question and repo_id are required'
            });
        }

        // 1. Get embedding from Python worker
        const embedRes = await axios.post(
            `${process.env.WORKER_URL}/embed`,
            { text: question },
            { timeout: 60000 }
        );
        const { embedding } = embedRes.data;
        const vectorStr = `[${embedding.join(',')}]`;

        // 2. Vector search
        const vectorResults = await pool.query(
            `SELECT c.id as chunk_id, c.content, c.type, c.name,
                    c.start_line, c.end_line, f.path,
                    e.embedding <=> $1 AS distance
             FROM embeddings e
             JOIN chunks c ON c.id = e.chunk_id
             JOIN files f ON f.id = c.file_id
             WHERE f.repo_id = $2
             ORDER BY distance ASC
             LIMIT 50`,
            [vectorStr, repo_id]
        );

        // 3. Full-text search
        const textResults = await pool.query(
            `SELECT c.id as chunk_id, c.content, c.type, c.name,
                    c.start_line, c.end_line, f.path
             FROM chunks c
             JOIN files f ON f.id = c.file_id
             WHERE f.repo_id = $1
               AND c.content_tsv @@ websearch_to_tsquery('english', $2)
             LIMIT 50`,
            [repo_id, question]
        );

        // 4. RRF fusion
        const fused = reciprocalRankFusion(
            vectorResults.rows,
            textResults.rows
        );

        // 5. Trim to context limit
        const trimmed = trimToContextLimit(fused, question);

        if (trimmed.length === 0) {
            return res.status(404).json({
                error: 'No relevant code found for this question'
            });
        }

        // 6. Assemble context
        const context = trimmed
            .map((c, i) =>
                `[${i + 1}] File: ${c.path} (lines ${c.start_line}-${c.end_line})\n${c.content}`
            )
            .join('\n\n---\n\n');

        // 7. Groq LLM generation
        const completion = await client.chat.completions.create({
            model: 'qwen/qwen3.6-27b',
            messages: [
                {
                    role: 'system',
                    content: `You are a codebase assistant. Answer using ONLY the provided code snippets.
You MUST respond with valid JSON only — no explanation, no markdown, no backticks, no <think> tags.
Return exactly this shape:
{"answer": "your explanation here", "citations": [{"file": "path/to/file.ts", "startLine": 10, "endLine": 25, "summary": "what this code does"}]}`
                },
                {
                    role: 'user',
                    content: `Code snippets:\n\n${context}\n\nQuestion: ${question}\n\nRespond with JSON only:`
                }
            ],
            temperature: 0.1,
            max_tokens: 1024
        });

        // 8. Parse response safely
        const { answer, citations } = parseLLMResponse(
            completion.choices[0].message.content
        );

        // 9. Store query in DB
        await pool.query(
            `INSERT INTO queries (user_id, repo_id, question, answer, sources)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, repo_id, question, answer, JSON.stringify(citations)]
        );

        logger.info('query_answered', { repo_id, user_id: userId });

        res.json({ answer, citations });

    } catch (err) {
        logger.error('query_failed', { error: err.message });
        next(err);
    }
}

// ─── GET /api/query/:repo_id/history ─────────────────────
async function getHistory(req, res, next) {
    try {
        const { repo_id } = req.params;
        const result = await pool.query(
            `SELECT id, question, answer, sources, created_at
             FROM queries
             WHERE repo_id = $1 AND user_id = $2
             ORDER BY created_at DESC
             LIMIT 20`,
            [repo_id, req.user.id]
        );
        res.json({ queries: result.rows });
    } catch (err) {
        next(err);
    }
}

async function getAllHistory(req, res, next) {
    try {
        const result = await pool.query(
            `SELECT q.id, q.question, q.answer, q.sources, q.created_at,
                    q.repo_id, r.github_url
             FROM queries q
             JOIN repos r ON r.id = q.repo_id
             WHERE q.user_id = $1
             ORDER BY q.created_at DESC
             LIMIT 100`,
            [req.user.id]
        );
        res.json({ queries: result.rows });
    } catch (err) {
        next(err);
    }
}
module.exports = { queryRepo, getHistory, getAllHistory };