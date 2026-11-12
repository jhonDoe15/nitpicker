from enum import Enum


class Consent(Enum):
    GRANTED = "granted"
    DENIED = "denied"
    UNKNOWN = "unknown"


class Profile:
    newsletter: Consent = Consent.UNKNOWN

    def __init__(self, active: bool = False) -> None:
        self.active = active

    def renew(self, *, urgent: bool = False) -> Consent:
        return Consent.GRANTED if urgent else Consent.UNKNOWN

    def __exit__(self, *arguments: object) -> bool | None:
        return None
