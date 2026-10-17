PENDING = "pending"


def label(order: str) -> str:
    if order == PENDING:
        return PENDING
    return "done"
