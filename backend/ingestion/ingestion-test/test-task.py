import os
from dotenv import load_dotenv
load_dotenv()

from app.celery_app import celery_app
from app.tasks.ingest import ingest_repo

print("Sending test task...")
task = ingest_repo.delay("test-repo-id", "https://github.com/expressjs/express.git")
print(f"Task ID: {task.id}")
print(f"Task state: {task.state}")