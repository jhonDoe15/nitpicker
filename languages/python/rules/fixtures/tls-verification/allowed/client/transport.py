import ssl

import httpx
import requests
from pymongo import MongoClient

from client.settings import CA_BUNDLE


def fetch(url: str, ca_path: str) -> requests.Response:
    return requests.get(url, verify=ca_path, timeout=10)


def api_client() -> httpx.Client:
    return httpx.Client(verify=CA_BUNDLE)


def client_context(ca_path: str) -> ssl.SSLContext:
    return ssl.create_default_context(cafile=ca_path)


def server_context(cert: str, key: str, ca_path: str) -> ssl.SSLContext:
    context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH, cafile=ca_path)
    context.load_cert_chain(cert, key)
    context.verify_mode = ssl.CERT_OPTIONAL
    return context


def database(uri: str, ca_path: str) -> MongoClient:
    return MongoClient(uri, tls=True, tlsCAFile=ca_path)


def warn(logger: object) -> None:
    logger.warning("PYTHONHTTPSVERIFY=0 turns certificate checks off; unset it")
