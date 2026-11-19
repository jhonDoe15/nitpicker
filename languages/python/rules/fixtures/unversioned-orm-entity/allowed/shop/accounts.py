from sqlalchemy import select

from .models import Account, AuditEntry, Ledger


def deposit(session, account_id, amount):
    account = session.get(Account, account_id)
    account.balance += amount
    session.commit()


def record(session, text):
    session.add(AuditEntry(text=text))
    session.commit()


def balance(session, account_id):
    return session.scalars(select(Account).where(Account.id == account_id)).one().balance


def close_ledger(session, ledger_id):
    ledger = session.scalars(select(Ledger).where(Ledger.id == ledger_id).with_for_update()).one()
    ledger.total = 0
    session.commit()
