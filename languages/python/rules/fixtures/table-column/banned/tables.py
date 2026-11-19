import django_tables2 as tables
from django.db import models


class Address(models.Model):
    label = models.CharField(max_length=40)

    @property
    def is_primary(self):
        return True


class AddressTable(tables.Table):
    is_primary = tables.BooleanColumn(verbose_name="Primary")

    class Meta:
        model = Address
        fields = ("label", "is_primary")
