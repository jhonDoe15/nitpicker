import sys

from .features.settings import print_settings


def main(text: str) -> None:
    print_settings(text, sys.stdout)
