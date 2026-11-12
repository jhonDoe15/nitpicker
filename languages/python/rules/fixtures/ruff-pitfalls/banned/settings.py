import copy
import os


def environment():
    return [
        copy.copy(os.environ),
        os.getenv("PORT", 8080),
        os.getenv(1),
    ]
