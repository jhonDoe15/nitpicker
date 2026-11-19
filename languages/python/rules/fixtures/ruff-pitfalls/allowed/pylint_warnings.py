import math
import subprocess
import threading
from pathlib import Path

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
    subprocess.Popen(["ls"], process_group=0)
    subprocess.run(["git", "status"], check=True, timeout=30)


def is_clean():
    result = subprocess.run(["git", "diff", "--quiet"], check=False, timeout=30)
    return result.returncode == 0


def locked():
    with LOCK:
        return 1


def strip(lines):
    return [line.strip() for line in lines]


def largest(a, b, c):
    return max(a, b, c)


def log(lines, line):
    if not line:
        return
    lines.append(line)


def same(value, other):
    return value == other


def either(kind):
    return kind in {"a", "b"}


def read_context(context_file):
    with Path(context_file).open(encoding="utf-8") as handle:
        return handle.read()


def read_bytes(context_file):
    with Path(context_file).open("rb") as handle:
        return handle.read()
