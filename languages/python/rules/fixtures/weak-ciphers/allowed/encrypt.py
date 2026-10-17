from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def encrypt(key: bytes, nonce: bytes, data: bytes) -> bytes:
    return AESGCM(key).encrypt(nonce, data, None)
