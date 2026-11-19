import json


def read(raw):
    body = json.loads(raw)
    return body.get("alt", "")
