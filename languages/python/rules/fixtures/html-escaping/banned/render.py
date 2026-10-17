import jinja2
import markupsafe
from django.utils.safestring import mark_safe


def render(name):
    jinja2.Environment(autoescape=False)
    markupsafe.Markup(name)
    return mark_safe(name)
