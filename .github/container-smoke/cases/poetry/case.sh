# The Python sample as a Poetry project: the environment Poetry creates must stay in the checkout
# (.venv) for the gate's later container to find it.
SAMPLE=languages/python/adapters/fixtures/python-project
OVERLAYS=python
prepare() {
  cat >"$work/pyproject.toml" <<'TOML'
[project]
name = "demo"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = []

[tool.poetry]
packages = [{ include = "demo", from = "src" }]

[tool.poetry.group.dev.dependencies]
coverage = "*"
mutmut = "*"
mypy = "*"
pytest = "*"
ruff = "*"

[build-system]
requires = ["poetry-core>=2.0"]
build-backend = "poetry.core.masonry.api"
TOML
}
SETUP='poetry install --no-interaction'
VIOLATION_RULE='^ruff/F401$'
