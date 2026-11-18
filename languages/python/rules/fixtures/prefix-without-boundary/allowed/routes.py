def strip_base(pathname, base):
    if pathname == base or pathname.startswith(base + "/"):
        return pathname[len(base) :]
    return pathname
