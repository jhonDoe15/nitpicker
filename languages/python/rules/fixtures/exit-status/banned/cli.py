def run(args):
    try:
        args.func(args)
    except TypeError:
        raise SystemExit
