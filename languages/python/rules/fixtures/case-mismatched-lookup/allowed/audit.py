def is_disabled(name, hint_names):
    disabled = {value.lower() for value in hint_names}
    return name.lower() in disabled
