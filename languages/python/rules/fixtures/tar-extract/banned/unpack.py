import tarfile


def unpack(path, target):
    with tarfile.open(path) as archive:
        archive.extractall(target)
