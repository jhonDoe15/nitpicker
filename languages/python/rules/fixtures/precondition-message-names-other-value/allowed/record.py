def build(name, value):
    if name is None:
        raise ValueError("name must not be None")
    return (name, value)
