from django.utils.translation import gettext as _


def greet(name):
    first = _("Hello {name}").format(name=name)
    second = _("Hello {}").format(name)
    third = _("Hello %s") % name
    return first, second, third
