from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender=Order)
def on_order(sender, **_):
    pass
