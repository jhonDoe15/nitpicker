from django.db import models
from django.db.models.expressions import RawSQL


def search(name):
    models.Model.objects.extra(select={"a": name})
    return RawSQL("select " + name, [])
