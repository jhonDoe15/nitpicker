from vendor import CONSTANT
from vendor import Widget
from vendor import tool

order_id = 1


class OrderLine:
    line_id = 1

    def method(self):
        return self

    @classmethod
    def build(cls):
        return cls

    def total(self):
        return 1


def load_orders(order_id):
    total = 1
    return total, order_id, CONSTANT, Widget, tool


class OrderFailedError(Exception):
    pass
