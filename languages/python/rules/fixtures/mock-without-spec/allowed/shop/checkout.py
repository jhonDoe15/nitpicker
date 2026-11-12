from shop.mailer import Mailer, send


class Checkout:
    def __init__(self, mailer: Mailer) -> None:
        self.mailer = mailer

    def pay(self) -> str:
        return self.mailer.send("a") + send("b")
