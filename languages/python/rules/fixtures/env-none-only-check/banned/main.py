import os


def api_url() -> str:
    if os.environ.get("API_URL") is None:
        raise RuntimeError("API_URL is not set")
    return os.environ["API_URL"]


def port() -> str:
    return os.getenv("PORT", "8000")
