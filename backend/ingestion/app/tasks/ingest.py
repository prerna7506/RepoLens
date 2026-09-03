import os
import shutil
import hashlib
import tempfile
import json

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

CACHE_TTL_SECONDS = 86400 * 7  # 7 days

# ── File-type configuration ────────────────────────────────
# Extension -> language label stored in files.language.
# Longer/more specific extensions must be checked before shorter ones
# (handled by sorting in get_language()), e.g. ".test.ts" vs ".ts".
ALLOWED_EXTENSIONS = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".scss": "css",
    ".json": "json",
    ".md": "markdown",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".java": "java",
    ".go": "go",
    ".rb": "ruby",
    ".php": "php",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".rs": "rust",
    ".sql": "sql",
    ".sh": "shell",
    ".vue": "vue",
}

# Languages that have a Tree-sitter grammar wired up above — everything
# else falls back to generic line-block chunking (chunk_generic()).
AST_SUPPORTED_LANGUAGES = {"javascript", "typescript"}

# Suffixes to always skip regardless of extension match (tests, minified,
# lockfiles, sourcemaps — low value / noisy / huge).
SKIP_SUFFIXES = (
    ".spec.ts", ".test.ts", ".test.js", ".test.tsx", ".test.jsx",
    ".min.js", ".min.css", ".map",
)
SKIP_FILENAMES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock",
}


def get_language(filename: str):
    """Return the language label for a filename, or None if unsupported.
    Checked longest-extension-first so e.g. '.test.ts' style suffix
    exclusions aren't defeated by the plain '.ts' match."""
    for ext in sorted(ALLOWED_EXTENSIONS, key=len, reverse=True):
        if filename.endswith(ext):
            return ALLOWED_EXTENSIONS[ext]
    return None


# ── Helpers ────────────────────────────────────────────────
def get_db():
    return psycopg2.connect(DATABASE_URL)

def sha256(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()


def chunk_generic(code: str, max_lines: int = 150, overlap: int = 20):
    """Fallback chunker for any language without a Tree-sitter grammar.
    Splits the file into overlapping line-blocks so large files (e.g. long
    HTML templates, big JSON configs) still fit within embedding/context
    limits, while small files are stored as a single chunk."""
    lines = code.split("\n")
    chunks = []

    if len(lines) <= max_lines:
        if code.strip():
            chunks.append({
                "type": "block",
                "name": "file",
                "content": code,
                "start_line": 1,
                "end_line": len(lines),
                "parent_id": None,
            })
        return chunks

    step = max(max_lines - overlap, 1)
    i = 0
    while i < len(lines):
        block_lines = lines[i:i + max_lines]
        content = "\n".join(block_lines)
        if content.strip():
            chunks.append({
                "type": "block",
                "name": f"lines_{i + 1}-{min(i + max_lines, len(lines))}",
                "content": content,
                "start_line": i + 1,
                "end_line": min(i + max_lines, len(lines)),
                "parent_id": None,
            })
        i += step

    return chunks


def parse_ast(code: str, language: str):
    """Extract chunks from code using Tree-sitter AST (JS/TS only)."""
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


def parse_file(code: str, language: str):
    """Dispatch to AST parsing for JS/TS, generic line-block chunking
    for everything else."""
    if language in AST_SUPPORTED_LANGUAGES:
        return parse_ast(code, language)
    return chunk_generic(code)


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
        # file_id -> {"hash": content_hash, "chunks": [chunk dicts incl. db_id]}
        # Used to rebuild a full cache payload (chunks + vectors) after embedding,
        # so cache hits and cache misses store/read the exact same shape.
        file_chunk_cache = {}

        # Diagnostic counters — surfaced in the task's return value so a
        # zero-file ingestion is explainable without a manual DB query.
        walked_total = 0
        skipped_no_language = 0
        skipped_filename_or_suffix = 0
        skipped_empty_or_unreadable = 0
        skipped_too_large = 0

        for root, dirs, files in os.walk(tmp_dir):
            dirs[:] = [
                d for d in dirs
                if d not in ["node_modules", ".git", "dist", "build", ".angular",
                              "__pycache__", ".next", "venv", ".venv", "vendor"]
            ]

            for filename in files:
                walked_total += 1

                if filename in SKIP_FILENAMES:
                    skipped_filename_or_suffix += 1
                    continue
                if filename.endswith(SKIP_SUFFIXES):
                    skipped_filename_or_suffix += 1
                    continue

                language = get_language(filename)
                if language is None:
                    skipped_no_language += 1
                    continue  # unsupported/binary file type — still excluded

                filepath = os.path.join(root, filename)
                rel_path = os.path.relpath(filepath, tmp_dir).replace("\\", "/")

                # Delta mode: skip files not in changed_files list
                if is_delta and rel_path not in changed_files:
                    continue

                try:
                    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                except Exception:
                    skipped_empty_or_unreadable += 1
                    continue

                if not content.strip():
                    skipped_empty_or_unreadable += 1
                    continue

                # Skip very large files outright (e.g. bundled/generated JSON)
                # rather than producing dozens of low-value chunks.
                if len(content) > 2_000_000:  # ~2MB of text
                    logger.warning("file_too_large_skipped", path=rel_path)
                    skipped_too_large += 1
                    continue

                content_hash = sha256(content)
                # ✅ byte size of the file, used by the frontend's GitHub-style
                # language bar (weighted by bytes, not file count).
                size_bytes = len(content.encode("utf-8"))

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
                       (repo_id, path, content_hash, language, index_status, size_bytes)
                       VALUES (%s, %s, %s, %s, 'pending', %s)
                       ON CONFLICT DO NOTHING
                       RETURNING id""",
                    (repo_id, rel_path, content_hash, language, size_bytes)
                )
                row = cur.fetchone()
                if row is None:
                    cur.execute(
                        "SELECT id FROM files WHERE repo_id = %s AND path = %s",
                        (repo_id, rel_path)
                    )
                    row = cur.fetchone()
                    cur.execute(
                        "UPDATE files SET content_hash = %s, size_bytes = %s WHERE id = %s",
                        (content_hash, size_bytes, row[0])
                    )

                file_id = str(row[0])
                db.commit()

                # ── Check embedding cache ──────────────────────────
                # Cache stores the full chunk payload (metadata + vector) as JSON,
                # not just a boolean flag. A hit means we can insert chunks +
                # embeddings directly without re-parsing or re-embedding.
                cache_key = f"embed:cache:{content_hash}"
                cached = redis.get(cache_key)

                if cached:
                    try:
                        cached_data = json.loads(cached)
                        if not isinstance(cached_data, list):
                            raise ValueError("cached payload is not a list")
                    except (json.JSONDecodeError, ValueError):
                        # Stale/legacy cache entry (e.g. old boolean "1" flag).
                        # Treat as a miss instead of crashing the whole task.
                        logger.warning("cache_payload_invalid", path=rel_path)
                        cached_data = None

                    if cached_data is not None:
                        logger.info("cache_hit", path=rel_path)
                        for c in cached_data:
                            cur.execute(
                                """INSERT INTO chunks
                                   (file_id, type, name, content, start_line, end_line)
                                   VALUES (%s, %s, %s, %s, %s, %s)
                                   RETURNING id""",
                                (
                                    file_id,
                                    c["type"],
                                    c["name"],
                                    c["content"],
                                    c["start_line"],
                                    c["end_line"]
                                )
                            )
                            new_chunk_id = cur.fetchone()[0]
                            cur.execute(
                                """INSERT INTO embeddings (chunk_id, embedding, model_name)
                                   VALUES (%s, %s, %s)""",
                                (new_chunk_id, c["vector"], "BAAI/bge-small-en-v1.5")
                            )
                        cur.execute(
                            "UPDATE files SET index_status = 'embedded' WHERE id = %s",
                            (file_id,)
                        )
                        db.commit()
                        continue

                # Parse — AST for JS/TS, generic block-chunking otherwise
                chunks = parse_file(content, language)
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
                file_chunk_cache[file_id] = {
                    "hash": content_hash,
                    "chunks": chunks
                }

        # Embedding phase
        self.update_state(state="EMBEDDING")
        cur.execute(
            "UPDATE repos SET status = %s WHERE id = %s",
            ("embedding", repo_id)
        )
        db.commit()
        logger.info("embedding_chunks", count=len(all_chunks))

        BATCH_SIZE = 32
        db_id_to_vector = {}

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

            for chunk_id, vector in zip(chunk_ids, vectors):
                db_id_to_vector[chunk_id] = vector

        # ── Write real cache payloads (chunks + vectors, not a boolean) ──
        for file_id, data in file_chunk_cache.items():
            payload = []
            for c in data["chunks"]:
                vec = db_id_to_vector.get(c["db_id"])
                if vec is None:
                    # Shouldn't happen, but don't cache an incomplete payload
                    continue
                payload.append({
                    "type": c["type"],
                    "name": c["name"],
                    "content": c["content"],
                    "start_line": c["start_line"],
                    "end_line": c["end_line"],
                    "vector": vec
                })
            if payload:
                redis.setex(
                    f"embed:cache:{data['hash']}",
                    CACHE_TTL_SECONDS,
                    json.dumps(payload)
                )

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

        logger.info(
            "ingestion_complete",
            repo_id=repo_id,
            walked_total=walked_total,
            skipped_no_language=skipped_no_language,
            skipped_filename_or_suffix=skipped_filename_or_suffix,
            skipped_empty_or_unreadable=skipped_empty_or_unreadable,
            skipped_too_large=skipped_too_large,
            chunks=len(all_chunks),
        )
        return {
            "status": "completed",
            "chunks": len(all_chunks),
            "repo_id": repo_id,
            "delta": is_delta,
            "diagnostics": {
                "files_walked": walked_total,
                "skipped_no_language": skipped_no_language,
                "skipped_filename_or_suffix": skipped_filename_or_suffix,
                "skipped_empty_or_unreadable": skipped_empty_or_unreadable,
                "skipped_too_large": skipped_too_large,
            },
        }

    except Exception as e:
        logger.error("ingestion_failed", error=str(e), repo_id=repo_id)
        try:
            fail_db = psycopg2.connect(DATABASE_URL)
            fail_cur = fail_db.cursor()
            fail_cur.execute("UPDATE repos SET status = %s WHERE id = %s", ("failed", repo_id))
            fail_db.commit()
            fail_db.close()
        except Exception as inner_e:
            logger.error("failed_to_mark_repo_failed", error=str(inner_e), repo_id=repo_id)
        raise
    finally:
        if tmp_dir and os.path.exists(tmp_dir):
            shutil.rmtree(tmp_dir, ignore_errors=True)
        if db:
            db.close()