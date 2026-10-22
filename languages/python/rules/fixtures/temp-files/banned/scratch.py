import tempfile


def scratch():
    tempfile.mktemp()
    return "/tmp/scratch.txt"
