from django.db import models


def create_project(user):
    if not Project.objects.filter(owner=user).exists():
        Project.objects.create(owner=user)
