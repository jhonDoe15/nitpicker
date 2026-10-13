import os


def config_path(base: str) -> str:
    return os.path.join(base, "config.toml")
