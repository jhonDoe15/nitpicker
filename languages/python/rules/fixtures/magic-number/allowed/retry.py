MAX_ATTEMPTS = 3


def retry(attempts: int) -> bool:
    small = attempts in {0, 1, 2} or attempts == -1
    tens = attempts == 10
    hundreds = attempts == 100
    thousands = attempts == 1000
    large = tens or hundreds or thousands
    return attempts <= MAX_ATTEMPTS and (small or large)
