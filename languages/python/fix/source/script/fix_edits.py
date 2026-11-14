import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RULES = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(HERE))), "rules")
MINIMUM_PYTHON = (3, 10)


def run(payload):
    if sys.version_info < MINIMUM_PYTHON:
        version = ".".join(str(part) for part in sys.version_info[:3])
        return {"fixes": [], "declines": [], "skipped": version}
    sys.path[:0] = [HERE, RULES]
    sys.dont_write_bytecode = True
    from runner import main

    return main(payload)


if __name__ == "__main__":
    json.dump(run(json.load(sys.stdin)), sys.stdout)
