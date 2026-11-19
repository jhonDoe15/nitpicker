from shop import mailer


def bill(to: str) -> str:
    return mailer.Mailer().send(to)
