import torch.nn.functional as F
from sqlalchemy.orm import declared_attr
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


class Model:
    @declared_attr
    def created_by(cls):
        return cls

    def fit(self, X, y):
        X_train = X
        return F, X_train, y
