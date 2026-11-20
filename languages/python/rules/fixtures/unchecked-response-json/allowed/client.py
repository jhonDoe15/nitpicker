import requests


def load_user(url):
    response = requests.get(url)
    response.raise_for_status()
    return response.json()
