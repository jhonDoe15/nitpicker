def build(name, value):
    if value is None:
        raise ValueError("name must not be None")
    return (name, value)
