from contextlib import closing

from db.session import AsyncManaged, Conditional, Managed, Opaque, Resource, Session


def manual(session: Session):
    session.begin()
    try:
        session.write(1)
    finally:
        session.close()


def nested_finally(session: Session):
    try:
        session.begin()
    finally:
        try:
            session.rollback()
        finally:
            session.close()


def not_cleanup(session: Session):
    try:
        session.begin()
    except ValueError:
        session.rollback()
    else:
        session.commit()


def with_own_value():
    with Managed() as session:
        session.write(1)


def with_parameter(session: Managed):
    with session:
        session.write(2)


def with_field():
    helper = Holder()
    helper.run()


class Holder:
    def __init__(self):
        self.session = Managed()
        self.pool = AsyncManaged()

    def run(self):
        with self.session:
            self.session.write(3)

    async def run_async(self):
        async with self.pool as opened:
            opened.write(4)


def conditional_exit(session: Conditional):
    with session:
        session.write(5)


def opaque_value():
    with Opaque() as thing:
        thing.anything()


def closing_resource(resource: Resource):
    with closing(resource):
        pass


def external_context():
    with open("data") as handle:
        handle.read()


class Unit:
    def __init__(self, session: Session):
        self.session = session

    def start(self):
        self.session.begin()


def opened(session: Session) -> Session:
    session.begin()
    return session


from contextlib import ExitStack  # noqa: E402


def stacked(session: Session):
    with ExitStack() as stack:
        stack.callback(session.commit)
        session.begin()


def entered(session: Managed):
    with ExitStack() as stack:
        stack.enter_context(session)
        session.write(5)


def unstacked(session: Session):
    stack = ExitStack()
    stack.callback(session.commit)
    session.begin()


def never_called(session: Session):
    session.begin()

    def later():
        try:
            session.write(6)
        finally:
            session.commit()

    return later


def called_helper(session: Session):
    session.begin()

    def finish():
        try:
            session.write(7)
        finally:
            session.commit()

    finish()
