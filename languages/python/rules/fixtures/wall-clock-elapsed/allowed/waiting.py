import time


def wait_until(done, timeout):
    start_time = time.monotonic()
    while not done():
        if time.monotonic() - start_time > timeout:
            raise TimeoutError
