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

// gpt-oss-120b has a 65,536 max-completion ceiling (vs Qwen's 16,384),
// so we can afford a slightly larger context window than before.
function trimToContextLimit(chunks, question, limit = 3000) {
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

// ─── JSON Schema for the RAG answer ───────────────────────
// strict: true + gpt-oss-120b => Groq uses constrained decoding, so the
// response is GUARANTEED to match this shape. No <think> blocks, no
// markdown fences, no malformed JSON — so no parseLLMResponse() needed.
const REPO_ANSWER_SCHEMA = {
    type: 'json_schema',
    json_schema: {
        name: 'repo_answer',
        strict: true,
        schema: {
            type: 'object',
            properties: {
                answer: { type: 'string' },
                citations: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            file: { type: 'string' },
                            startLine: { type: 'integer' },
                            endLine: { type: 'integer' },
                            summary: { type: 'string' }
                        },
                        required: ['file', 'startLine', 'endLine', 'summary'],
                        additionalProperties: false
                    }
                }
            },
            required: ['answer', 'citations'],
            additionalProperties: false
        }
    }
};

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

        // 7. Groq LLM generation (gpt-oss-120b, strict JSON schema)
        const completion = await client.chat.completions.create({
            model: 'openai/gpt-oss-120b',
            messages: [
                {
                    role: 'system',
                    content: 'You are a codebase assistant. Answer using ONLY the provided code snippets. If the snippets do not contain enough information to answer, say so in the answer field and return an empty citations array.'
                },
                {
                    role: 'user',
                    content: `Code snippets:\n\n${context}\n\nQuestion: ${question}`
                }
            ],
            temperature: 0.1,
            max_tokens: 2000,
            response_format: REPO_ANSWER_SCHEMA
        });

        const finishReason = completion.choices[0].finish_reason;
        if (finishReason === 'length') {
            logger.error('query_truncated', { repo_id, user_id: userId });
            return res.status(502).json({
                error: 'Model response was truncated before completion. Try a narrower question.'
            });
        }

        // 8. Parse response — guaranteed valid JSON under strict mode
        const { answer, citations } = JSON.parse(completion.choices[0].message.content);

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
// ─── GET /api/query/stats ─────────────────────────────────
async function getQueryStats(req, res, next) {
    try {
        const result = await pool.query(
            `SELECT COUNT(*) AS total_queries FROM queries WHERE user_id = $1`,
            [req.user.id]
        );
        res.json({ totalQueries: parseInt(result.rows[0].total_queries, 10) });
    } catch (err) {
        next(err);
    }
}

module.exports = { queryRepo, getHistory, getAllHistory, getQueryStats };