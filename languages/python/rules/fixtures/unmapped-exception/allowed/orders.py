from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()


class OrderNotFoundError(Exception):
    pass


@app.exception_handler(OrderNotFoundError)
async def order_not_found(_request: Request, _error: OrderNotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": "order not found"})


def find_order(order_id: int) -> dict[str, int]:
    if order_id < 0:
        raise OrderNotFoundError
    return {"id": order_id}


@app.get("/orders/{order_id}")
def read_order(order_id: int) -> dict[str, int]:
    return find_order(order_id)
