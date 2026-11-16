class OrderService:
    def __init__(self, session, audit_session):
        self.session = session
        self.audit_session = audit_session

    def place(self, order, item):
        with self.session.begin():
            self.session.add(order)
            self.audit_session.add(item)
