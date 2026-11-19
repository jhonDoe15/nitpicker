from django.db.models.signals import post_save
from django.dispatch import receiver

from models import CablePath


@receiver(post_save, sender=CablePath)
def update_paths(instance, using, **kwargs):
    CablePath.objects.filter(origin=instance.pk).delete()
