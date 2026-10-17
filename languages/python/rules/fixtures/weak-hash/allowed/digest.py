import hashlib
import hmac

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives import hmac as crypto_hmac
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.hmac import HMAC as SIGNING_HMAC


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


def webhook_signature(secret: bytes, body: bytes) -> bytes:
    algorithm = hashes.SHA1()
    signer = SIGNING_HMAC(secret, algorithm)
    signer.update(body)
    return signer.finalize()


def wrap_key(public_key: rsa.RSAPublicKey, key: bytes) -> bytes:
    return public_key.encrypt(
        key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA1()),
            algorithm=hashes.SHA1(),
            label=None,
        ),
    )
