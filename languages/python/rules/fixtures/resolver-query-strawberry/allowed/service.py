from shop.models import Account


def export_all() -> list[Account]:
    return list(Account.objects.all())
