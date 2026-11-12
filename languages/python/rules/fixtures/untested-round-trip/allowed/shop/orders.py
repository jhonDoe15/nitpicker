import json


def encode_order(order: dict[str, int]) -> str:
    return json.dumps(order)


def decode_order(text: str) -> dict[str, int]:
    return dict(json.loads(text))
