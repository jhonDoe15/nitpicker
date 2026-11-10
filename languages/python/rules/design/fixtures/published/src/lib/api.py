from typing import Literal

Mode = Literal["fast", "slow"]


class Client:
    def send(self, body):
        return body


def connect():
    return Client()


def _secret():
    return 1
