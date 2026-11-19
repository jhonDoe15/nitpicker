from django.db import models


class Group(models.Model):
    name = models.CharField(max_length=40)
    slug = models.SlugField(unique=True)


def find(name):
    return Group.objects.get(name=name)
