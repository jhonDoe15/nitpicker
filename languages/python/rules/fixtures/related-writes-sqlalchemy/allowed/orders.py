def place(session, order, item):
    with session.begin():
        session.add(order)
        session.add(item)


def place_once(session, order, item):
    session.add(order)
    session.add(item)
    session.commit()


def place_nested(session, order, item):
    with session.begin_nested():
        session.add(order)
    session.add(item)
    session.commit()
