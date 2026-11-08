import sys

from .features.billing import format_shares, split_bill


def main(total_cents: int, people: list[str]) -> None:
    format_shares(split_bill(total_cents, people), sys.stdout)
