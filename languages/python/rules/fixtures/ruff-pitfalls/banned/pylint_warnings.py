import math
import os
import pdb
import subprocess
import threading
from pathlib import Path

global SHARED


def wrap(items):
    return sorted(items, key=lambda item: str(item))


def search(items, wanted):
    for item in items:
        if item == wanted:
            return item
    else:
        return None


def assign(value):
    value = value
    first, first = value, value
    return first


def walrus(value):
    (doubled := value * 2)
    return doubled


def check(value):
    ValueError("Not raised")
    return value == math.nan


class Tools:
    @staticmethod
    def build(self):
        return self

    def reset(self):
        self = Tools()
        self.ready = True
        return self


class Child(Tools):
    def __init__(self):
        super.__init__()


def literal():
    assert "always"


def files(name):
    with Path(name).open("rwx", encoding="utf-8") as handle:
        return handle.read()


def spawn():
    subprocess.Popen(["ls"], preexec_fn=os.setsid)
    subprocess.run(["git", "status"])
    pdb.set_trace()


def locked():
    with threading.Lock():
        return 1


def strip(lines):
    for line in lines:
        line = line.strip()
        yield line


def largest(a, b, c):
    return max(a, max(b, c))
