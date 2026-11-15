import io
import re
import tokenize

from source_text import refuse, replacement

IGNORE = re.compile(r"#[ \t]*type:[ \t]*ignore\b(?:\[([^\]]*)\])?")
UNUSED = re.compile(r'^Unused "type: ignore(?:\[([^\]]*)\])?" comment$')


def codes_of(text):
    return [code.strip() for code in text.split(",") if code.strip()]


def comments_on(source, line):
    body = source.text[source.shift :]
    for token in tokenize.generate_tokens(io.StringIO(body).readline):
        if token.type == tokenize.COMMENT and token.start[0] == line:
            yield token


def narrowed(source, token, match, unused):
    present = codes_of(match.group(1) or "")
    if not present or not set(unused) <= set(present):
        refuse("the comment does not list the codes mypy calls unused")
    kept = [code for code in present if code not in unused]
    if not kept:
        return None
    start = source.starts[token.start[0] - 1] + token.start[1] + match.start(1)
    return [replacement(start, start + len(match.group(1)), ", ".join(kept))]


def removal(source, token, match):
    line_start = source.starts[token.start[0] - 1]
    comment = line_start + token.start[1]
    head = token.string[: match.start()]
    tail = token.string[match.end() :]
    first = comment + match.start()
    following = tail.find("#")
    if tail.strip() and (following < 0 or tail[:following].strip()):
        refuse("words follow the ignore in the same comment")
    if following >= 0:
        return [replacement(first, comment + match.end() + following, "")]
    last = comment + len(token.string)
    if head.strip():
        return [replacement(first - (len(head) - len(head.rstrip())), last, "")]
    before = source.text[line_start:comment]
    if not before.strip():
        refuse("the ignore sits on a line of its own")
    return [replacement(comment - (len(before) - len(before.rstrip())), last, "")]


def unused_ignore(source, line, message):
    found = UNUSED.match(message)
    if found is None:
        refuse("the mypy message is not a plain unused ignore")
    tokens = [
        (token, match)
        for token in comments_on(source, line)
        for match in IGNORE.finditer(token.string)
    ]
    if len(tokens) != 1:
        refuse("no single type: ignore comment on the line")
    token, match = tokens[0]
    if found.group(1) is not None:
        edits = narrowed(source, token, match, codes_of(found.group(1)))
        if edits is not None:
            return edits
    return removal(source, token, match)
