def is_number(text: str) -> bool:
    try:
        int(text)
    except ValueError:
        return False
    return True
