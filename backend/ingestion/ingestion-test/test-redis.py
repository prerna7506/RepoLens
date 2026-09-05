import os
from dotenv import load_dotenv
load_dotenv()

import redis

REDIS_URL = os.getenv("REDIS_URL")
print(f"Connecting to: {REDIS_URL[:30]}...")

try:
    r = redis.Redis.from_url(
        REDIS_URL,
        socket_connect_timeout=5,
        ssl_cert_reqs=None
    )
    result = r.ping()
    print(f"✅ Redis connected: {result}")
except Exception as e:
    print(f"❌ Redis failed: {e}")