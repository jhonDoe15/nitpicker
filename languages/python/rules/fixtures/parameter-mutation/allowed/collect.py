def collect(
    names: list[str], seen: set[str], counts: dict[str, int]
) -> tuple[list[str], set[str], dict[str, int]]:
    return [*names, "new"], seen | {"new"}, {**counts, "new": 1}


def collect_copy(names: list[str]) -> list[str]:
    names = list(names)
    names.append("new")
    return names


def local(names: list[str]) -> list[str]:
    result: list[str] = []
    result.extend(names)
    return result
