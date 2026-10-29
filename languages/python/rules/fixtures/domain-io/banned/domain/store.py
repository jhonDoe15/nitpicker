import os
import subprocess
import requests


def save(path, text):
    with open(path, "w") as handle:
        handle.write(text)
    return requests, subprocess


def listing(folder):
    return os.popen(f"ls {folder}").read()
