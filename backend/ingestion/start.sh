#!/bin/sh

set -e

celery -A app.celery_app worker \
    --loglevel=info \
    --concurrency=1 \
    --max-tasks-per-child=100 \
    --time-limit=600 &

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"