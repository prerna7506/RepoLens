import ssl
from celery import Celery
from app.config import REDIS_URL

REDIS_URL_SSL = REDIS_URL + "?ssl_cert_reqs=CERT_NONE"

celery_app = Celery(
    "ingestion_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks.ingest"] 
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    broker_connection_retry_on_startup=True,
    broker_use_ssl={
        "ssl_cert_reqs": ssl.CERT_NONE
    },
    redis_backend_use_ssl={
        "ssl_cert_reqs": ssl.CERT_NONE
    }
)

celery_app.autodiscover_tasks(["app.tasks"])