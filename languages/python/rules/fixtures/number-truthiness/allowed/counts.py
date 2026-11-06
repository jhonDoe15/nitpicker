def retry_header(retry: int) -> str:
    return f"retry: {retry}" if retry > 0 else ""


def save(record_id: int | None) -> str:
    if record_id is None:
        return "new"
    return "saved"
