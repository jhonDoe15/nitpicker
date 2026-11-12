from typing import Optional


class Profile:
    newsletter: bool | None = None

    def __init__(self, active: Optional[bool] = None) -> None:
        self.active = active

    def renew(self, urgent: bool | None = None) -> bool | None:
        return urgent
