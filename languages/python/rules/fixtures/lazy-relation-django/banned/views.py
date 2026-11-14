from django.db import models


class Customer(models.Model):
    name = models.CharField(max_length=80)


class Order(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE)


def customer_names():
    return [order.customer.name for order in Order.objects.all()]
