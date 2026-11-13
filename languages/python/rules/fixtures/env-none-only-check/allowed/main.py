import os


def api_url() -> str:
    url = os.environ.get("API_URL")
    if not url:
        raise RuntimeError("API_URL is not set")
    return url


def port() -> str:
    return os.environ.get("PORT") or "8000"
