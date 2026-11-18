import time


def wait_until(done, timeout):
    start_time = time.time()
    while not done():
        if time.time() - start_time > timeout:
            raise TimeoutError
