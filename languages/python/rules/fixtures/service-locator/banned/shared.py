import punq

from mailer import Mailer

container = punq.Container()


def resolve_mailer() -> Mailer:
    return container.resolve(Mailer)
