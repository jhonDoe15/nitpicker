def merge(values):
    names = (value.strip() for value in values)
    if "admin" in names:
        return None
    return sorted(names)
