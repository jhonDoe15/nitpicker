import time

RETRY_DELAY = 2


def poll(fetch):
    while not fetch():
        time.sleep(RETRY_DELAY)
