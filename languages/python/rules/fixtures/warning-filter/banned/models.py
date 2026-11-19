import warnings


def create_model(name, build):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return build(name)
