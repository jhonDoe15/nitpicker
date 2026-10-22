import math
import subprocess
import threading

LOCK = threading.Lock()


def wrap(items):
    return sorted(items, key=str)


def search(items, wanted):
    for item in items:
        if item == wanted:
            return item
    return None


def check(value):
    if math.isnan(value):
        raise ValueError(value)
    return value


def catch(run):
    try:
        return run()
    except (ValueError, TypeError) as error:
        raise RuntimeError("Run failed") from error


def spawn():
    subprocess.Popen(["ls"], start_new_session=True)
    subprocess.run(["git", "status"], check=True)


def is_clean():
    result = subprocess.run(["git", "diff", "--quiet"], check=False)
    return result.returncode == 0


def locked():
    with LOCK:
        return 1


def strip(lines):
    return [line.strip() for line in lines]


def largest(a, b, c):
    return max(a, b, c)
