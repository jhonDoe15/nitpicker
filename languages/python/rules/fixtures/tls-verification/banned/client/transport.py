import ssl

import httpx
import requests
import urllib3
from pymongo import MongoClient

from client.settings import DEBUG, VERIFY_TLS


def fetch(url):
    return requests.get(url, verify=not DEBUG, timeout=10)


def api_client():
    return httpx.Client(verify=VERIFY_TLS)


def session_for(token):
    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {token}"
    session.verify = False
    return session


def insecure_context():
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    return context


def pool():
    return urllib3.PoolManager(cert_reqs="CERT_NONE")


def database(uri):
    return MongoClient(uri, tls=True, tlsAllowInvalidCertificates=True)


def patch_globally():
    ssl._create_default_https_context = ssl._create_unverified_context
