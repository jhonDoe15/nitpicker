import jinja2
import markupsafe
from django.utils.html import format_html


def render(name: str) -> object:
    jinja2.Environment(autoescape=jinja2.select_autoescape())
    return markupsafe.escape(name), format_html("<b>{}</b>", name)
