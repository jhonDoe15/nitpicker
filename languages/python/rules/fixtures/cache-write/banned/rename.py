from django.core.cache import cache
from django.db import transaction


def rename(user, name):
    with transaction.atomic():
        user.name = name
        user.save()
        cache.set(f"user:{user.id}", user)
