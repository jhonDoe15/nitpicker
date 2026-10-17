from vendor import CONSTANT as constant
from vendor import Widget as camel
from vendor import Widget as WIDGET
from vendor import WidgetFactory as WF
from vendor import tool as Tool

orderId = 1


class order_line:
    lineId = 1

    def method(this):
        return this

    @classmethod
    def build(self):
        return self

    def __total__(self):
        return 1


def LoadOrders(OrderId):
    Total = 1
    return Total


class Failure(Exception):
    pass


def __helper__():
    return 1
