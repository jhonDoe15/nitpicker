def place(session, order, item):
    session.add(order)
    session.commit()
    session.add(item)
    session.commit()
