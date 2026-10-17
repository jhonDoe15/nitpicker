import json

import yaml


def load(data: str) -> object:
    json.loads(data)
    return yaml.safe_load(data)
