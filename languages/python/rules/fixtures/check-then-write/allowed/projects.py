from django.db import models, transaction


def create_project(user):
    Project.objects.get_or_create(owner=user)


def create_limited(user):
    with transaction.atomic():
        if not Project.objects.select_for_update().filter(owner=user).exists():
            Project.objects.create(owner=user)
