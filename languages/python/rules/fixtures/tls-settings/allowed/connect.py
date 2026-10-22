import ssl

import requests
from cryptography.hazmat.primitives.asymmetric import rsa


def fetch(url: str) -> object:
    requests.get(url, timeout=10)
    requests.get(url, verify="/etc/ssl/ca.pem", timeout=10)
    context = ssl.create_default_context()
    return context, rsa.generate_private_key(65537, 3072)
