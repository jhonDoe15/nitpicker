from django.db.models import Q


def interfaces(device):
    return Interface.objects.filter(Q(device=device) if device.pk else Q())
