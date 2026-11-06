def retry_header(retry: int) -> str:
    return f"retry: {retry}" if retry else ""


def save(record_id: int | None) -> str:
    if not record_id:
        return "new"
    return "saved"
