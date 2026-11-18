def setting_value(line: str) -> str:
    return line.split("=")[1]


def header_value(header: str) -> str:
    parts = header.split(":")
    return parts[1].strip()
