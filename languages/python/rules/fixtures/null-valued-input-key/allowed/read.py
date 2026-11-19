import json


def read(raw):
    body = json.loads(raw)
    return body.get("alt") or ""


def count(raw):
    body = json.loads(raw)
    value = body.get("count")
    return value if value is not None else 0
