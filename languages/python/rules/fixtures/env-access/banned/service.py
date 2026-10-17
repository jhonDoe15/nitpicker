import os


def endpoint():
    return os.environ["API_URL"], os.getenv("API_TOKEN")
