def is_disabled(name, hint_names):
    disabled = set(hint_names)
    return name.lower() in disabled
