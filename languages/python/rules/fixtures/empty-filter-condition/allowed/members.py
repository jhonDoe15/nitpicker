def interfaces(device):
    if device.pk:
        return Interface.objects.filter(device=device)
    return Interface.objects.none()
