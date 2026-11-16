from django.db import transaction


class OrderService:
    def __init__(self, session, audit_session):
        self.session = session
        self.audit_session = audit_session

    def place(self, order, item):
        with self.session.begin():
            self.session.add(order)
            self.session.add(item)

    def audit(self, entry):
        self.audit_session.add(entry)
        self.audit_session.commit()


def archive(order, entry):
    with transaction.atomic(using="archive"):
        Order.objects.using("archive").create(order=order)
        Entry.objects.using("archive").create(entry=entry)
