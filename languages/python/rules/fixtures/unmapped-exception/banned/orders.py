from fastapi import FastAPI

app = FastAPI()


class OrderNotFoundError(Exception):
    pass


def find_order(order_id: int) -> dict[str, int]:
    if order_id < 0:
        raise OrderNotFoundError
    return {"id": order_id}


@app.get("/orders/{order_id}")
def read_order(order_id: int) -> dict[str, int]:
    return find_order(order_id)
