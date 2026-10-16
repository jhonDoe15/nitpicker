import hashlib


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def cache_key(data: bytes) -> str:
    return hashlib.md5(data, usedforsecurity=False).hexdigest()
