from pathlib import Path


def config_path(base: Path) -> Path:
    return base / "config.toml"
