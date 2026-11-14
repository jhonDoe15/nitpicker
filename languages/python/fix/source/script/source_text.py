import ast
import re

LINES = re.compile(r"[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+")
BOM = "﻿"


class Source:
    def __init__(self, text):
        self.text = text
        self.shift = 1 if text.startswith(BOM) else 0
        body = text[self.shift :]
        self.tree = ast.parse(body)
        self.lines = LINES.findall(body)
        self.starts = []
        offset = self.shift
        for line in self.lines:
            self.starts.append(offset)
            offset += len(line)

    def point(self, line, column):
        text = self.lines[line - 1]
        return self.starts[line - 1] + len(
            text.encode("utf-8")[:column].decode("utf-8")
        )

    def span(self, node):
        return (
            self.point(node.lineno, node.col_offset),
            self.point(node.end_lineno, node.end_col_offset),
        )

    def source_of(self, node):
        start, end = self.span(node)
        return self.text[start:end]

    def line_of(self, offset):
        return sum(1 for start in self.starts if start <= offset) or 1

    def utf16(self, offset):
        return len(self.text[:offset].encode("utf-16-le", "surrogatepass")) // 2


def replacement(start, end, text):
    return (start, end, text)


class Decline(Exception):
    pass


def refuse(reason):
    raise Decline(reason)


def required(edit, reason):
    if edit is None:
        refuse(reason)
    return edit
