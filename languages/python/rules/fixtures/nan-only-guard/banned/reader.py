import math


def read_limit(text, default):
    value = float(text)
    if math.isnan(value):
        return default
    return value
