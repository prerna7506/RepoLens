import ssl
from celery import Celery
from app.config import REDIS_URL

# Upstash already uses rediss:// — just append ssl param
REDIS_URL_SSL = REDIS_URL + "?ssl_cert_reqs=CERT_NONE" \
    if "?" not in REDIS_URL else REDIS_URL

celery_app = Celery(
    "ingestion_worker",
    broker=REDIS_URL_SSL,
    backend=REDIS_URL_SSL,
    include=["app.tasks.ingest"]
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    broker_connection_retry_on_startup=True,

    # ── Reduce startup delay ──────────────────────────────
    broker_transport_options={
        "visibility_timeout": 3600,
        "socket_timeout": 10,
        "socket_connect_timeout": 10,
        "retry_on_timeout": True,
    },
    worker_prefetch_multiplier=1,
    task_acks_late=True,

    broker_use_ssl={
        "ssl_cert_reqs": ssl.CERT_NONE
    },
    redis_backend_use_ssl={
        "ssl_cert_reqs": ssl.CERT_NONE
    }
)