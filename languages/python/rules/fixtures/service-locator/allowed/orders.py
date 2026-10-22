from mailer import Mailer


class Orders:
    def __init__(self, mailer: Mailer) -> None:
        self.mailer = mailer

    def confirm(self, order_id: str) -> None:
        self.mailer.send(order_id)
