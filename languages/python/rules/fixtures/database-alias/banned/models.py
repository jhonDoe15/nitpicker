from django.db import models


class CablePath(models.Model):
    origin = models.IntegerField()
