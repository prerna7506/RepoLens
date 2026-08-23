import os
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import time
import psycopg2
import redis as redis_client
from fastapi import FastAPI, Request
from pydantic import BaseModel
from app.celery_app import celery_app
from app.config import DATABASE_URL, REDIS_URL
from app.logger import logger

app = FastAPI(title="RepoLens Ingestion Worker")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    logger.info(
        "request",
        route=request.url.path,
        method=request.method,
        status=response.status_code,
        duration_ms=round((time.time() - start) * 1000, 2),
    )
    return response


@app.get("/health")
def health():
    status = {"postgres": "down", "redis": "down", "worker": "ok"}
    try:
        conn = psycopg2.connect(DATABASE_URL, connect_timeout=2)
        conn.close()
        status["postgres"] = "ok"
    except Exception as e:
        logger.error("postgres_health_failed", error=str(e))

    try:
        import ssl
        r = redis_client.Redis.from_url(
            REDIS_URL,
            socket_connect_timeout=5,
            ssl_cert_reqs=ssl.CERT_NONE
        )
        r.ping()
        status["redis"] = "ok"
    except Exception as e:
        logger.error("redis_health_failed", error=str(e))

    return status


@app.get("/tasks/{task_id}")
def get_task_status(task_id: str):
    result = celery_app.AsyncResult(task_id)
    return {
        "task_id": task_id,
        "state": result.state,
        "result": result.result if result.ready() else None
    }


# ← ADD THESE at the bottom
class IngestRequest(BaseModel):
    repo_id: str
    clone_url: str
    changed_files: list = None


@app.post("/ingest")
def start_ingest(req: IngestRequest):
    from app.tasks.ingest import ingest_repo
    task = ingest_repo.delay(req.repo_id, req.clone_url, req.changed_files)
    return {"task_id": task.id}

class EmbedRequest(BaseModel):
    text: str

@app.post("/embed")
def embed_text(req: EmbedRequest):
    from app.tasks.ingest import get_model
    model = get_model()
    embedding = model.encode(
        [req.text], normalize_embeddings=True
    ).tolist()[0]
    return {"embedding": embedding}