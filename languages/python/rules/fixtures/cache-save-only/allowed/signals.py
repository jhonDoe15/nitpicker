from django.core.cache import cache
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver


@receiver(post_save, sender=PolicyBinding)
@receiver(post_delete, sender=PolicyBinding)
def invalidate_policy_cache(sender, instance, **_):
    cache.delete_many(keys_for(instance))


def purge(bindings):
    bindings.delete()
