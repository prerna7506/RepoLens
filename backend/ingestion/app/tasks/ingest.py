import os
import shutil
import hashlib
import tempfile

import git
import psycopg2
from psycopg2.extras import execute_values
from sentence_transformers import SentenceTransformer
from tree_sitter import Language, Parser
import tree_sitter_javascript as tsjavascript
import tree_sitter_typescript as tstypescript

from app.celery_app import celery_app
from app.config import DATABASE_URL, REDIS_URL
from app.logger import logger

import redis as redis_client

# ── Lazy load model ────────────────────────────────────────
_model = None

def get_model():
    global _model
    if _model is None:
        logger.info("loading_embedding_model")
        _model = SentenceTransformer("BAAI/bge-small-en-v1.5")
    return _model

# ── Tree-sitter languages ──────────────────────────────────
JS_LANGUAGE = Language(tsjavascript.language(), "javascript")
TS_LANGUAGE = Language(tstypescript.language_typescript(), "typescript")

# ── Redis for embedding cache ──────────────────────────────
redis = redis_client.Redis.from_url(
    REDIS_URL,
    decode_responses=True,
    ssl_cert_reqs=None
)

# ── Helpers ────────────────────────────────────────────────
def get_db():
    return psycopg2.connect(DATABASE_URL)

def sha256(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()

def parse_ast(code: str, language: str):
    """Extract chunks from code using Tree-sitter AST."""
    parser = Parser()
    if language == "typescript":
        parser.set_language(TS_LANGUAGE)
    else:
        parser.set_language(JS_LANGUAGE)

    tree = parser.parse(bytes(code, "utf8"))
    chunks = []

    def node_text(node):
        return code[node.start_byte:node.end_byte]

    def get_name(node):
        for child in node.children:
            if child.type in ("identifier", "property_identifier"):
                return node_text(child)
        return "anonymous"

    def walk(node, parent_id=None):
        chunk_type = None

        if node.type in (
            "function_declaration",
            "function_expression",
            "generator_function_declaration"
        ):
            chunk_type = "function"

        elif node.type == "class_declaration":
            chunk_type = "class"

        elif node.type == "method_definition":
            chunk_type = "method"

        elif node.type == "import_statement":
            chunk_type = "import"

        elif node.type == "arrow_function":
            parent = node.parent
            if parent and parent.type == "variable_declarator":
                chunk_type = "function"

        elif node.type == "variable_declaration":
            for child in node.children:
                if child.type == "variable_declarator":
                    for grandchild in child.children:
                        if grandchild.type in (
                            "function_expression",
                            "arrow_function",
                            "object_expression"
                        ):
                            chunk_type = "function"

        if chunk_type:
            content = node_text(node)
            if len(content.strip()) > 30:
                chunks.append({
                    "type": chunk_type,
                    "name": get_name(node),
                    "content": content,
                    "start_line": node.start_point[0] + 1,
                    "end_line": node.end_point[0] + 1,
                    "parent_id": parent_id
                })

        for child in node.children:
            walk(child, parent_id)

    walk(tree.root_node)

    # Fallback: if no chunks found store whole file as one chunk
    if not chunks and len(code.strip()) > 50:
        chunks.append({
            "type": "function",
            "name": "module",
            "content": code[:3000],
            "start_line": 1,
            "end_line": code.count('\n') + 1,
            "parent_id": None
        })

    return chunks


# ── Main Celery task ───────────────────────────────────────
@celery_app.task(bind=True, name="ingest_repo")
def ingest_repo(self, repo_id: str, github_url: str, changed_files: list = None):
    """Main ingestion task — supports full and delta indexing."""
    tmp_dir = None
    db = None

    try:
        db = get_db()
        cur = db.cursor()

        is_delta = changed_files is not None and len(changed_files) > 0
        logger.info("ingestion_started", repo_id=repo_id, delta=is_delta)

        self.update_state(state="CLONING")
        cur.execute(
            "UPDATE repos SET status = %s WHERE id = %s",
            ("cloning", repo_id)
        )
        db.commit()

        # Shallow clone
        tmp_dir = tempfile.mkdtemp()
        repo = git.Repo.clone_from(
            github_url, tmp_dir, depth=1, single_branch=True
        )
        commit_sha = repo.head.commit.hexsha

        self.update_state(state="PARSING")
        cur.execute(
            "UPDATE repos SET status = %s WHERE id = %s",
            ("parsing", repo_id)
        )
        db.commit()

        all_chunks = []

        for root, dirs, files in os.walk(tmp_dir):
            dirs[:] = [
                d for d in dirs
                if d not in ["node_modules", ".git", "dist", ".angular", "__pycache__"]
            ]

            for filename in files:
                if not filename.endswith((".ts", ".js")):
                    continue
                if filename.endswith((".spec.ts", ".test.ts", ".test.js", ".min.js")):
                    continue

                filepath = os.path.join(root, filename)
                rel_path = os.path.relpath(filepath, tmp_dir).replace("\\", "/")

                # Delta mode: skip files not in changed_files list
                if is_delta and rel_path not in changed_files:
                    continue

                language = "typescript" if filename.endswith(".ts") else "javascript"

                try:
                    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                except Exception:
                    continue

                if not content.strip():
                    continue

                content_hash = sha256(content)

                # Delta mode: delete old chunks for this file first
                if is_delta:
                    cur.execute(
                        """DELETE FROM chunks WHERE file_id IN (
                           SELECT id FROM files WHERE repo_id = %s AND path = %s
                        )""",
                        (repo_id, rel_path)
                    )
                    db.commit()

                # Upsert file record
                cur.execute(
                    """INSERT INTO files
                       (repo_id, path, content_hash, language, index_status)
                       VALUES (%s, %s, %s, %s, 'pending')
                       ON CONFLICT DO NOTHING
                       RETURNING id""",
                    (repo_id, rel_path, content_hash, language)
                )
                row = cur.fetchone()
                if row is None:
                    cur.execute(
                        "SELECT id FROM files WHERE repo_id = %s AND path = %s",
                        (repo_id, rel_path)
                    )
                    row = cur.fetchone()
                    cur.execute(
                        "UPDATE files SET content_hash = %s WHERE id = %s",
                        (content_hash, row[0])
                    )

                file_id = str(row[0])
                db.commit()

                # Check embedding cache
                cache_key = f"embed:cache:{content_hash}"
                if redis.exists(cache_key):
                    logger.info("cache_hit", path=rel_path)
                    cur.execute(
                        "UPDATE files SET index_status = 'embedded' WHERE id = %s",
                        (file_id,)
                    )
                    db.commit()
                    continue

                # Parse AST
                chunks = parse_ast(content, language)
                if not chunks:
                    continue

                # Store chunks
                for chunk in chunks:
                    cur.execute(
                        """INSERT INTO chunks
                           (file_id, type, name, content, start_line, end_line)
                           VALUES (%s, %s, %s, %s, %s, %s)
                           RETURNING id""",
                        (
                            file_id,
                            chunk["type"],
                            chunk["name"],
                            chunk["content"],
                            chunk["start_line"],
                            chunk["end_line"]
                        )
                    )
                    chunk["db_id"] = str(cur.fetchone()[0])

                cur.execute(
                    "UPDATE files SET index_status = 'chunked' WHERE id = %s",
                    (file_id,)
                )
                db.commit()
                all_chunks.extend(
                    [(c["db_id"], c["content"]) for c in chunks]
                )

        # Embedding phase
        self.update_state(state="EMBEDDING")
        cur.execute(
            "UPDATE repos SET status = %s WHERE id = %s",
            ("embedding", repo_id)
        )
        db.commit()
        logger.info("embedding_chunks", count=len(all_chunks))

        BATCH_SIZE = 32
        for i in range(0, len(all_chunks), BATCH_SIZE):
            batch = all_chunks[i:i + BATCH_SIZE]
            chunk_ids = [b[0] for b in batch]
            texts = [b[1] for b in batch]
            vectors = get_model().encode(
                texts, normalize_embeddings=True
            ).tolist()

            embedding_rows = [
                (chunk_id, vector, "BAAI/bge-small-en-v1.5")
                for chunk_id, vector in zip(chunk_ids, vectors)
            ]
            execute_values(
                cur,
                """INSERT INTO embeddings (chunk_id, embedding, model_name)
                   VALUES %s ON CONFLICT DO NOTHING""",
                embedding_rows
            )
            db.commit()

        # Cache content hashes in Redis
        for root, dirs, files in os.walk(tmp_dir):
            dirs[:] = [d for d in dirs if d not in ["node_modules", ".git"]]
            for filename in files:
                if not filename.endswith((".ts", ".js")):
                    continue
                filepath = os.path.join(root, filename)
                try:
                    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                    h = sha256(content)
                    redis.setex(f"embed:cache:{h}", 86400 * 7, "1")
                except Exception:
                    pass

        # Mark completed
        cur.execute(
            "UPDATE files SET index_status = 'embedded' WHERE repo_id = %s",
            (repo_id,)
        )
        cur.execute(
            """UPDATE repos SET status = %s, last_indexed_commit = %s
               WHERE id = %s""",
            ("completed", commit_sha, repo_id)
        )
        db.commit()

        logger.info("ingestion_complete", repo_id=repo_id)
        return {
            "status": "completed",
            "chunks": len(all_chunks),
            "repo_id": repo_id,
            "delta": is_delta
        }

    except Exception as e:
        logger.error("ingestion_failed", error=str(e))
        if db:
            try:
                cur.execute(
                    "UPDATE repos SET status = %s WHERE id = %s",
                    ("failed", repo_id)
                )
                db.commit()
            except Exception:
                pass
        raise

    finally:
        if tmp_dir and os.path.exists(tmp_dir):
            shutil.rmtree(tmp_dir, ignore_errors=True)
        if db:
            db.close()