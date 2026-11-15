def is_json(request) -> bool:
    return request.headers["Content-Type"] == "application/json"


def accepted(request) -> list[str]:
    return request.headers.get("Accept", "").split(",")
