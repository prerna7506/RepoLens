# RepoLens

AI-powered codebase intelligence. Connect a GitHub repo, ask questions in plain English, get answers grounded in the actual code with clickable file/line citations.

Repos are cloned, AST-parsed into function/class-level chunks, embedded, and indexed for hybrid (semantic + keyword) search. Questions are answered via RAG: search results are fused, trimmed to a token budget, and sent to an LLM that must return structured JSON citations.

## Architecture

```mermaid
flowchart TB
    FE["Angular 21 frontend<br/>SSR, standalone components"]
    GW["Node.js / Express API gateway<br/>auth, REST API, Socket.io"]
    PG[("PostgreSQL + pgvector<br/>chunks, embeddings, FTS")]
    RD[("Redis (Upstash)<br/>queue, cache, rate limiter")]
    IW["Python / FastAPI + Celery<br/>clone, parse, chunk, embed"]
    GH["GitHub<br/>clone + webhooks"]
    GR["Groq LLM<br/>openai/gpt-oss-120b"]

    FE -->|REST + WebSocket| GW
    GW --> PG
    GW --> RD
    GW -->|POST /ingest| IW
    GW -->|chat completion| GR
    IW --> GH
    IW --> PG
    GH -->|webhook: push| GW
```

1. User adds a repo → API gateway enqueues ingestion on the Python/Celery worker.
2. Worker shallow-clones, parses ~20 file types (Tree-sitter AST for JS/TS, a generic line-block chunker for everything else — Python, Java, Go, Ruby, PHP, C/C++, Rust, HTML/CSS, JSON, YAML, Markdown, SQL, shell, Vue), embeds with `BAAI/bge-small-en-v1.5`, writes to Postgres (embedding cache in Redis by content SHA256).
3. A question triggers vector search (pgvector) + full-text search (Postgres FTS), fused via Reciprocal Rank Fusion, trimmed with `tiktoken`, and sent to Groq (`openai/gpt-oss-120b`, chosen for its 65,536-token max-completion ceiling vs. smaller alternatives) for a cited JSON answer.
4. Socket.io broadcasts shared query history and file-viewing presence to everyone viewing the same repo.
5. GitHub webhooks trigger delta re-indexing of changed files only.

## Features

- GitHub OAuth login with short-lived access tokens + `httpOnly` refresh cookies (Redis-backed denylist on logout)
- Connect a repo, watch ingestion progress, browse the file tree, and fetch file content via `GET /api/repos/:id/files` and `GET /api/repos/:id/files/content`
- Hybrid semantic + keyword search with cited, clickable answers rendered in Monaco
- Shared query history and live file-viewing presence per repo over Socket.io
- GitHub webhook–driven delta re-indexing of only the changed files
- Per-user query rate limiting

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Angular 21 (SSR, standalone components, signals), Socket.io client |
| API Gateway | Node.js, Express 5, JWT auth, Socket.io |
| Ingestion Worker | Python, FastAPI, Celery, Tree-sitter + generic fallback chunker |
| Database | PostgreSQL + pgvector (HNSW) + full-text search |
| Queue / Cache | Redis (Upstash) |
| Embeddings | `BAAI/bge-small-en-v1.5` |
| LLM | Groq (`openai/gpt-oss-120b`) |

## Local development

No Docker — each service runs standalone against free-tier hosted Postgres/Redis.

```bash
# API gateway
cd backend/api-gateway && npm install && npm run dev        # :3000

# Ingestion worker
cd backend/ingestion && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
celery -A app.celery_app worker --loglevel=info --pool=solo # --pool=solo on Windows

# Frontend
cd frontend && npm install && npm start                     # :4200
```

Requires a root `.env` (see `.env.example`) with `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`, `GITHUB_WEBHOOK_SECRET`, `GROQ_API_KEY`, `WORKER_URL`, `FRONTEND_URL`, `PORT`.
