DEFAULT_PREFERENCES = {"theme": "light"}


class UserConfig:
    def __init__(self, data: dict) -> None:
        self.data = data

    def set_theme(self, theme: str) -> None:
        self.data["theme"] = theme


def build() -> UserConfig:
    return UserConfig(data=DEFAULT_PREFERENCES)
