import hashlib
import hmac

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives import hmac as crypto_hmac


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def cache_key(data: bytes) -> str:
    return hashlib.md5(data, usedforsecurity=False).hexdigest()


def totp_code(secret: bytes, counter: bytes) -> bytes:
    return hmac.new(secret, counter, hashlib.sha1).digest()


def oauth_signature(secret: bytes, base: bytes) -> bytes:
    signer = crypto_hmac.HMAC(
        secret,
        hashes.SHA1(),
    )
    signer.update(base)
    return signer.finalize()
