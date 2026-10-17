from cryptography.hazmat.primitives.ciphers import algorithms, modes


def encrypt():
    return algorithms.ARC4(b"key"), modes.ECB()
