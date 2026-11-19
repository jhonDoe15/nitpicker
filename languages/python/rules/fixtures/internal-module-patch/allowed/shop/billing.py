import time

from shop.mailer import Mailer


def bill(to: str, mailer: Mailer) -> str:
    time.sleep(0)
    return mailer.send(to)
