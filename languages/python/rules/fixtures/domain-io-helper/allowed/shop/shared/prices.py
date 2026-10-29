import requests


def fetch(symbol: str) -> float:
    return float(requests.get(f"https://prices.example/{symbol}", timeout=5).text)
