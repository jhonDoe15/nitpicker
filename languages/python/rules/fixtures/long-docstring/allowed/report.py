def render(rows: list[str]) -> str:
    """Join trimmed rows with newlines; an empty list gives an empty string.

    Args:
        rows: the lines to join. Empty rows are kept.
        They are trimmed first.

    Returns:
        The text, without a trailing newline.
    """
    return "\n".join(row.strip() for row in rows)
