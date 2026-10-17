import hmac
from hashlib import md5

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives import hmac as crypto_hmac

from signing.algorithms import LEGACY_DIGEST


def sign(secret, body):
    return hmac.new(secret, body, md5).hexdigest()


def sign_named(secret, body):
    return hmac.new(secret, body, digestmod="md5").hexdigest()


def sign_legacy(secret, body):
    return hmac.digest(secret, body, LEGACY_DIGEST)


def sign_cryptography(secret, body):
    signer = crypto_hmac.HMAC(secret, hashes.MD5())
    signer.update(body)
    return signer.finalize()
