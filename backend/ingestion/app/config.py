import os
from dotenv import load_dotenv
from pathlib import Path

root_env = Path(__file__).parent.parent.parent.parent / '.env'
load_dotenv(dotenv_path=root_env)

DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL")