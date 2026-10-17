import requests


def sync(ids):
    results = []
    for item in ids:
        results.append(requests.get(f"https://example.com/{item}", timeout=10))
    return results
