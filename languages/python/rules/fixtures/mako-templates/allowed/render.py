import jinja2


def render(text: str) -> object:
    return jinja2.Environment(autoescape=True).from_string(text)
