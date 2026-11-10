class Mailer:
    def send(self, order_id: str) -> None:
        raise NotImplementedError(order_id)
