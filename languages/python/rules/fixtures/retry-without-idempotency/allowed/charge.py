import stripe
from tenacity import retry


@retry
def charge(amount: int, key: str) -> object:
    return stripe.PaymentIntent.create(amount=amount, currency="usd", idempotency_key=key)
