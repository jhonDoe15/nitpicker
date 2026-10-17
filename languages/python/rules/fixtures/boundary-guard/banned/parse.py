import json


def parse(text):
    data = json.loads(text)
    if isinstance(data, dict):
        return data
    return {}
