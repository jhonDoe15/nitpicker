import stripe
from tenacity import retry


@retry
def charge(amount: int, key: str) -> object:
    return stripe.PaymentIntent.create(amount=amount, currency="usd", idempotency_key=key)


@retry
def record(cursor, key: str) -> None:
    cursor.execute("INSERT INTO t (k) SELECT %s WHERE NOT EXISTS (SELECT 1 FROM t WHERE k = %s)", (key, key))
