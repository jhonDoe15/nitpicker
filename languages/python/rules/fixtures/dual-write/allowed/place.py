def place(repository, outbox, order) -> None:
    repository.save(order)
    outbox.save({"topic": "orders", "body": order})
