import stripe
from tenacity import retry


@retry
def charge(amount):
    return stripe.PaymentIntent.create(amount=amount, currency="usd")
