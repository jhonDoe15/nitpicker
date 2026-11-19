from .models import Account


def deposit(session, account_id, amount):
    account = session.get(Account, account_id)
    account.balance += amount
    session.commit()
