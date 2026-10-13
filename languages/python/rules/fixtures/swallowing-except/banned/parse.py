def parse(text: str) -> None:
    try:
        int(text)
    except ValueError:
        pass
