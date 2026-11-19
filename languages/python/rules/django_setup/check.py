import re
from pathlib import Path

from checks.common import finding
from django_models.graph import project_graph

RULE = "django-types-missing"
CONFIG_FILES = (
    "pyproject.toml",
    "Pipfile",
    "setup.cfg",
    "setup.py",
    "mypy.ini",
    ".mypy.ini",
    "tox.ini",
    "pyrightconfig.json",
)
REQUIREMENTS = ("requirements*.txt", "requirements/*.txt")
DJANGO = re.compile(r"(?im)(?:^|[\s\"',\[(])django(?:[\s\"',\]=<>!~;\[)]|$)")
TYPES = re.compile(r"django[-_]stubs|django[-_]types|mypy_django_plugin", re.IGNORECASE)


def config_texts():
    found = [path for pattern in REQUIREMENTS for path in Path(".").glob(pattern)]
    texts = []
    for file in [Path(name) for name in CONFIG_FILES] + sorted(found):
        try:
            texts.append(file.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError):
            continue
    return texts


def reporter(project):
    def build(_):
        texts = config_texts()
        if not any(DJANGO.search(text) for text in texts):
            return None
        if any(TYPES.search(text) for text in texts):
            return None
        models = [
            model
            for model in project_graph(project).by_key.values()
            if not model.context.tests
        ]
        if not models:
            return None
        return min(models, key=lambda model: (model.context.path, model.node.lineno))

    return project.memo("django-types-reporter", build)


def check(context):
    model = reporter(context.project)
    if model is None or model.context.path != context.path:
        return []
    return [finding(context.path, RULE, "django", model.node)]
