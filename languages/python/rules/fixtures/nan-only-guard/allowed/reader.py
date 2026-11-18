import math


def read_limit(text, default):
    value = float(text)
    if not math.isfinite(value):
        return default
    return value
