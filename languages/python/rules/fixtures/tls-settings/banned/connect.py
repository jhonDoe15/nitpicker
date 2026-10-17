import ssl

import requests
from cryptography.hazmat.primitives.asymmetric import rsa


def fetch(url, sock):
    requests.get(url, verify=False, timeout=10)
    ssl.SSLContext(ssl.PROTOCOL_SSLv3)
    ssl.wrap_socket(sock)
    ssl.wrap_socket(sock, ssl_version=ssl.PROTOCOL_SSLv2)
    ssl._create_unverified_context()
    return rsa.generate_private_key(65537, 512)


def connect(version=ssl.PROTOCOL_SSLv2):
    return version
