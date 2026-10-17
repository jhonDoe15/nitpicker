def send(message: str, *, urgent: bool) -> tuple[str, bool]:
    return message, urgent


def stop(message, *, force=False):
    return message, force
