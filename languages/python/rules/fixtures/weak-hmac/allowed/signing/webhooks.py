import hashlib
import hmac
import struct

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives import hmac as crypto_hmac


def sign(secret: bytes, body: bytes) -> str:
    return hmac.new(secret, body, hashlib.sha256).hexdigest()


def verify(secret: bytes, body: bytes, signature: str) -> bool:
    return hmac.compare_digest(sign(secret, body), signature)


def hotp(secret: bytes, counter: int) -> bytes:
    return hmac.new(secret, struct.pack(">Q", counter), "sha1").digest()


def oauth_signature(secret: bytes, base: bytes) -> bytes:
    signer = crypto_hmac.HMAC(secret, hashes.SHA1())
    signer.update(base)
    return signer.finalize()
