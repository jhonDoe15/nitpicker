from django.core.cache import cache
from django.db import transaction


def rename(user, name):
    with transaction.atomic():
        user.name = name
        user.save()
        transaction.on_commit(lambda: cache.delete(f"user:{user.id}"))


def refresh(user):
    with transaction.atomic():
        user.save()
    cache.set(f"user:{user.id}", user)


def purge(cache_entry):
    with transaction.atomic():
        cache_entry.delete()
