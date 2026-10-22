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
