def render(rows: list[str]) -> str:
    """Render the rows.

    The rows are joined with newlines.
    Empty rows are kept.
    Each row is trimmed first.
    The result has no trailing newline.
    An empty list gives an empty string.
    """
    return "\n".join(row.strip() for row in rows)
