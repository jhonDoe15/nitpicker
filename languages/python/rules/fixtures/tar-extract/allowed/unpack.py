import tarfile


def unpack(path: str, target: str) -> None:
    with tarfile.open(path) as archive:
        archive.extractall(target, filter="data")
