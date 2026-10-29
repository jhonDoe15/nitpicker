def share_cents(total_cents: int, count: int, position: int) -> int:
    base, remainder = divmod(total_cents, count)
    return base + 1 if position < remainder else base
