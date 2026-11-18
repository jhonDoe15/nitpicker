def hostname(request) -> str:
    host = request.headers.get("Host", "")
    return host.split(":")[0]


def forwarded(headers) -> str:
    return headers["x-forwarded-host"].partition(":")[0]
