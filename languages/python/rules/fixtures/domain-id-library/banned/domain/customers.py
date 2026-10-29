from faker import Faker


def placeholder_name() -> str:
    return str(Faker().name())
