import ast
import re

from source_text import replacement


def has_spread(call):
    return any(keyword.arg is None for keyword in call.keywords) or any(
        isinstance(argument, (ast.Starred, ast.GeneratorExp)) for argument in call.args
    )


def keyword_named(call, name):
    return next((item for item in call.keywords if item.arg == name), None)


def last_end(source, call):
    parts = [*call.args, *call.keywords]
    return max((source.span(part)[1] for part in parts), default=None)


def add_keyword(source, call, text):
    text_of = source.text
    close = source.span(call)[1] - 1
    if text_of[close] != ")":
        return None
    end = last_end(source, call)
    if end is None:
        opening = source.span(call.func)[1]
        between = text_of[opening : close + 1]
        return (
            replacement(close, close, text)
            if re.fullmatch(r"\s*\(\s*\)", between)
            else None
        )
    if "#" in text_of[end:close]:
        return None
    tail = text_of[end:close]
    if not re.fullmatch(r"[\s)]*,?\s*", tail):
        return None
    position = close
    while text_of[position - 1].isspace():
        position -= 1
    comma = tail.rstrip().endswith(",")
    return replacement(position, position, f" {text}" if comma else f", {text}")


def drop_keyword(source, call, keyword):
    text_of = source.text
    start, end = source.span(keyword)
    after = end
    while after < len(text_of) and text_of[after].isspace():
        after += 1
    if text_of[after : after + 1] == ",":
        after += 1
        while after < len(text_of) and text_of[after].isspace():
            after += 1
        drop = (start, after)
    else:
        before = start
        while text_of[before - 1].isspace():
            before -= 1
        if text_of[before - 1] == ",":
            drop = (before - 1, end)
        elif len(call.args) + len(call.keywords) == 1:
            drop = (start, end)
        else:
            return None
    if "#" in text_of[drop[0] : drop[1]]:
        return None
    return replacement(drop[0], drop[1], "")


def attribute_rename(source, func, name):
    end = source.span(func)[1]
    return replacement(end - len(func.attr), end, name)
