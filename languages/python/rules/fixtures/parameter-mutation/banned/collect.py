def collect(names: list[str], seen: set[str], counts: dict[str, int]) -> None:
    names.append("new")
    seen |= {"new"}
    counts["new"] = 1
