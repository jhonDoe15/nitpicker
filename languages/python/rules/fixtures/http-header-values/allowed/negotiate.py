from werkzeug.http import parse_accept_header


def is_json(request) -> bool:
    return request.headers["Content-Type"].casefold() == "application/json"


def accepted(request) -> list[str]:
    return [value for value, _ in parse_accept_header(request.headers.get("Accept", ""))]
