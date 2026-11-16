from django.db import models


class Order(models.Model):
    deleted_at = models.DateTimeField(null=True)
    total = models.IntegerField()
