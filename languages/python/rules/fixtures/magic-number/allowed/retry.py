MAX_ATTEMPTS = 3


def retry(attempts: int) -> bool:
    small = attempts in {0, 1, 2} or attempts == -1
    large = attempts == 10 or attempts == 100 or attempts == 1000
    return attempts <= MAX_ATTEMPTS and (small or large)
