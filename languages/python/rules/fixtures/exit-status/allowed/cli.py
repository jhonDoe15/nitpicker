def run(args):
    try:
        args.func(args)
    except TypeError as err:
        raise SystemExit(f"Invalid arguments: {err}") from err
