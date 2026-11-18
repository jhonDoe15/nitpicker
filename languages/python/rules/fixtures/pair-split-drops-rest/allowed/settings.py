def setting_value(line: str) -> str:
    _, _, value = line.partition("=")
    return value


def header_value(header: str) -> str:
    return header.split(":", 1)[1].strip()


def strict(header: str) -> str:
    name, value = header.split(":")
    return value


def checked(header: str) -> str:
    parts = header.split(":")
    if len(parts) != 2:
        raise ValueError(header)
    return parts[1]


def minutes(clock_time: str) -> str:
    return clock_time.split(":")[1]
