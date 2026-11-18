def strip_base(pathname, base):
    if pathname.startswith(base):
        return pathname[len(base) :]
    return pathname
