import time

RETRY_DELAY = 2


def poll(fetch, retry_delay=RETRY_DELAY):
    while not fetch():
        time.sleep(retry_delay)
