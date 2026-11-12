import os


def environment():
    return os.environ.copy(), int(os.getenv("PORT", "8080")), os.getenv("HOME")
