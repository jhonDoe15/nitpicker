import hashlib
from Cryptodome.Hash import MD5


def digest(data):
    hashlib.md5(data)
    hashlib.sha1(data)
    hashlib.new("md5", data)
    return MD5.new(data)
