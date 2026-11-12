from pricing import total


def pay() -> int:
    return total(3) + total(4, rate=3)
