import django_filters
from django.db import models


class Provider(models.Model):
    name = models.CharField(max_length=40)


class ProviderAccount(models.Model):
    provider = models.ForeignKey(Provider, on_delete=models.CASCADE)


class Circuit(models.Model):
    provider_account = models.ForeignKey(ProviderAccount, on_delete=models.CASCADE)


class CircuitFilterSet(django_filters.FilterSet):
    provider_account_id = django_filters.ModelMultipleChoiceFilter(queryset=ProviderAccount.objects.all())

    class Meta:
        model = Circuit
        fields = ["provider_account"]
