import subprocess
import requests


def save(path, text):
    with open(path, "w") as handle:
        handle.write(text)
    return requests, subprocess
