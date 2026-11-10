from shared import resolve_mailer


def confirm(order_id: str) -> None:
    resolve_mailer().send(order_id)
