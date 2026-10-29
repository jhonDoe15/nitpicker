class Mailer:
    def deliver(self, message: str, urgent: bool) -> str:
        return f"!{message}" if urgent else message


def stop(message, force=False):
    if force:
        return message.upper()
    return message


def render(text: str, upper: bool) -> str:
    if not upper:
        return text
    return text.upper()
