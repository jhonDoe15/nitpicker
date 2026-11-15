import io
import tokenize

from source_text import refuse, replacement

SKIPPED = {tokenize.NL, tokenize.NEWLINE, tokenize.INDENT, tokenize.DEDENT}
OPENERS = {"(", "[", "{"}
CLOSERS = {")", "]", "}"}


def offset(source, position):
    return source.starts[position[0] - 1] + position[1]


def header_tokens(source, fn):
    body = source.text[source.shift :]
    tokens = list(tokenize.generate_tokens(io.StringIO(body).readline))
    start = next(
        index
        for index, token in enumerate(tokens)
        if token.string == "def" and token.start[0] == fn.lineno
    )
    opening = start + 2
    if tokens[opening].string != "(":
        refuse("the signature has type parameters")
    return tokens, opening


def split_segments(tokens, opening):
    segments, current, depth = [], [], 0
    for token in tokens[opening + 1 :]:
        if token.type in SKIPPED:
            continue
        if token.string in OPENERS:
            depth += 1
        elif token.string in CLOSERS:
            if depth == 0:
                if current:
                    segments.append(current)
                return segments, token
            depth -= 1
        if depth == 0 and token.string == ",":
            segments.append(current)
            current = []
            continue
        current.append(token)
    refuse("the signature does not close")


def significant(segment):
    return [token for token in segment if token.type != tokenize.COMMENT]


def removal_span(source, segments, close, opening_token, index):
    this = significant(segments[index])
    if index + 1 < len(segments):
        following = significant(segments[index + 1])
        return this[0].start, following[0].start
    if index > 0:
        return significant(segments[index - 1])[-1].end, this[-1].end
    return opening_token.end, close.start


def remove_parameter(source, fn, parameter):
    tokens, opening = header_tokens(source, fn)
    segments, close = split_segments(tokens, opening)
    index = next(
        (
            position
            for position, segment in enumerate(segments)
            if significant(segment)
            and significant(segment)[0].string == parameter.arg
            and significant(segment)[0].start[0] == parameter.lineno
        ),
        None,
    )
    if index is None:
        refuse("the parameter was not found in the signature")
    rows = [token.start[0] for token in significant(segments[index])] + [
        token.end[0] for token in significant(segments[index])
    ]
    if any(
        token.type == tokenize.COMMENT and min(rows) - 1 <= token.start[0] <= max(rows)
        for token in tokens
    ):
        refuse("the parameter has comments next to it")
    begin = significant(segments[index])[0].start
    segments = [segment for segment in segments if significant(segment)]
    index = next(
        position
        for position, segment in enumerate(segments)
        if significant(segment)[0].start == begin
    )
    first, last = removal_span(source, segments, close, tokens[opening], index)
    inside = [
        token
        for token in tokens
        if token.type == tokenize.COMMENT and first <= token.start < last
    ]
    if inside:
        refuse("the parameter has comments next to it")
    return replacement(offset(source, first), offset(source, last), "")
