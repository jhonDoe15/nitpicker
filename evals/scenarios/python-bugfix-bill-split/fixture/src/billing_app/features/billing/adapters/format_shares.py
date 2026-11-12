from typing import TextIO

from ..domain.format_money import format_money
from ..domain.split_bill import Split


def format_shares(split: Split, writer: TextIO) -> None:
    width = max(len(share.name) for share in split.shares)
    for share in split.shares:
        writer.write(share.name.ljust(width) + "  " + format_money(share.cents) + "\n")
    writer.write("Total: " + format_money(split.total_cents) + "\n")
