# The Python sample pinned to another Python than the image's: uv downloads it into /opt/python,
# which a volume keeps from the setup container to the gate's.
SAMPLE=languages/python/adapters/fixtures/python-project
OVERLAYS=python
prepare() { echo 3.12 >"$work/.python-version"; }
VOLUME_AT=/opt/python
SETUP='uv sync'
VIOLATION_RULE='^ruff/F401$'
