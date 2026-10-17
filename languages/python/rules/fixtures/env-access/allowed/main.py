import os

from service import Settings


def settings() -> Settings:
    return Settings(os.environ["API_URL"], os.getenv("API_TOKEN"))
