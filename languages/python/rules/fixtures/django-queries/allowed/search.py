from django.db import models


def search(name: str) -> object:
    return models.Model.objects.filter(name=name)
