def pick(a, b):
    if a > b:
        return a
    for x in range(b):
        if x == 3:
            break
    while b > 100:
        b -= 1
    return b if a else 0


def lonely(a):
    if a:
        return 1
    return 2


def used(a):
    try:
        return a
    except ValueError:
        return 0


pick(1, 2)
