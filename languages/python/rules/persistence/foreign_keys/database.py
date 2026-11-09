import posixpath
import re
from pathlib import Path

MANIFESTS = ("pyproject.toml", "Pipfile", "setup.cfg", "setup.py")
REQUIREMENTS = ("requirements*.txt", "requirements/*.txt")
POSTGRES = re.compile(r"\b(?:psycopg2?(?:-binary)?|psycopg|asyncpg|pg8000)\b", re.IGNORECASE)
MYSQL = re.compile(
    r"\b(?:pymysql|mysqlclient|aiomysql|asyncmy|mysql-connector-python|mariadb)\b",
    re.IGNORECASE,
)
DJANGO_POSTGRES = ("django.db.backends.postgresql", "django.contrib.gis.db.backends.postgis")
DJANGO_MYSQL = "django.db.backends.mysql"
ALEMBIC_FOLDER = "versions"
ALEMBIC_ENV = "env.py"
REVISION = re.compile(r"^down_revision\b", re.MULTILINE)


def manifest_texts():
    found = [path for pattern in REQUIREMENTS for path in Path(".").glob(pattern)]
    files = [Path(name) for name in MANIFESTS] + sorted(found)
    texts = []
    for file in files:
        try:
            texts.append(file.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError):
            continue
    return texts


def mysql_only(project):
    manifests = manifest_texts()
    sources = [context.text for context in project.contexts.values()]
    postgres = any(POSTGRES.search(text) for text in manifests)
    postgres = postgres or any(engine in text for text in sources for engine in DJANGO_POSTGRES)
    mysql = any(MYSQL.search(text) for text in manifests)
    mysql = mysql or any(DJANGO_MYSQL in text for text in sources)
    return mysql and not postgres


def is_revision(project, path):
    context = project.contexts.get(path)
    return context is not None and REVISION.search(context.text) is not None


def has_alembic(project):
    paths = set(project.paths)
    for path in paths:
        folder = posixpath.dirname(path)
        if posixpath.basename(folder) != ALEMBIC_FOLDER:
            continue
        if posixpath.join(posixpath.dirname(folder), ALEMBIC_ENV) in paths and is_revision(project, path):
            return True
    return False
