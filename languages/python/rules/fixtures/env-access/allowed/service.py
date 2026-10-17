from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    url: str
    token: str | None


def endpoint(settings: Settings) -> str:
    return settings.url
