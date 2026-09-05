import os
from dotenv import load_dotenv
load_dotenv()

import redis
import ssl

r = redis.Redis.from_url(
    os.getenv("REDIS_URL"),
    ssl_cert_reqs=ssl.CERT_NONE,
    decode_responses=True
)

# Check all keys
keys = r.keys("*")
print("All Redis keys:", keys)

# Check celery queue length
length = r.llen("celery")
print(f"Celery queue length: {length}")