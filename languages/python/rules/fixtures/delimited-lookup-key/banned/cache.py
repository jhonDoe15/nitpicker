def read(seen: dict[str, bool], tenant: str, name: str) -> bool:
    return seen[f"{tenant}:{name}"]


def known(seen: dict[str, bool], tenant: str, name: str) -> bool:
    key = tenant + "-" + name
    return key in seen
