import tempfile


def scratch() -> str:
    with tempfile.TemporaryDirectory() as directory:
        return directory
