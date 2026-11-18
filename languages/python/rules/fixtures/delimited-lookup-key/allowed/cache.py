def read(seen: dict[tuple[str, str], bool], tenant: str, name: str) -> bool:
    return seen[(tenant, name)]


def known(seen: dict[tuple[str, str], bool], tenant: str, name: str) -> bool:
    return (tenant, name) in seen


def by_user(rows: dict[str, int], tenant_id: str, user_id: str) -> int:
    return rows[f"{tenant_id}:{user_id}"]


def untyped(rows: dict[str, int], tenant, name) -> int:
    return rows[f"{tenant}:{name}"]
