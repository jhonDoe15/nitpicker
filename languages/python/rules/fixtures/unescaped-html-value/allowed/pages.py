import html


def link(title: str, url: str) -> str:
    return f'<a href="{html.escape(url)}">{html.escape(title)}</a>'
