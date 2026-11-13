import os


def environment():
    return os.environ.copy(), int(os.getenv("PORT") or "8080"), os.getenv("HOME")
