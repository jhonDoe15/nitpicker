from django.utils.translation import gettext as _


def visit(place):
    return _("Visit {location} today").format(location=place)
