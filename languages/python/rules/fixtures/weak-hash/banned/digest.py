import hashlib
from Cryptodome.Hash import MD5


def digest(data):
    hashlib.md5(data)
    hashlib.sha1(data)
    hashlib.new("md5", data)
    return MD5.new(data)


def fingerprint(data):
    from cryptography.hazmat.primitives import hashes

    hasher = hashes.Hash(hashes.SHA1())
    hasher.update(data)
    return hasher.finalize()
