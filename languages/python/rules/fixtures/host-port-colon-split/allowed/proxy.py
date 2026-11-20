from urllib.parse import urlsplit


def hostname(request) -> str:
    return urlsplit("//" + request.headers.get("Host", "")).hostname or ""


def mac_parts(address: str) -> list[str]:
    return address.split(":")


def bracketed(host: str) -> str:
    if host.startswith("["):
        return host[1:host.index("]")]
    return host.split(":")[0]
