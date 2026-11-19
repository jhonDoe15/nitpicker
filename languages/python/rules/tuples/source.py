import ast
import io

WHITESPACE = b" \t\r\n\f"
MAX_TEXT = 60


def source_index(context):
    def build(_):
        lines = io.StringIO(context.text, newline="").readlines()
        encoded = [line.encode() for line in lines]
        starts, total = [], 0
        for line in encoded:
            starts.append(total)
            total += len(line)
        return b"".join(encoded), starts

    return context.project.memo(("tuple-source", context.path), build)


def before(data, position):
    while position > 0 and data[position - 1] in WHITESPACE:
        position -= 1
    return position


def after(data, position):
    while position < len(data) and data[position] in WHITESPACE:
        position += 1
    return position


def parenthesis_span(node, context):
    data, starts = source_index(context)
    end_line = getattr(node, "end_lineno", None)
    if end_line is None or end_line > len(starts) or node.lineno > len(starts):
        return None
    first = starts[node.lineno - 1] + node.col_offset
    last = starts[end_line - 1] + node.end_col_offset
    opening, closing = before(data, first), after(data, last)
    is_wrapped = (
        opening > 0
        and data[opening - 1 : opening] == b"("
        and closing < len(data)
        and data[closing : closing + 1] == b")"
    )
    return (opening - 1, closing + 1) if is_wrapped else None


def wrapped_text(node, context, prefix=""):
    span = parenthesis_span(node, context)
    if span is None:
        return None
    data, _ = source_index(context)
    text = " ".join(data[span[0] : span[1]].decode(errors="replace").split())
    shown = text if len(text) <= MAX_TEXT else f"{text[: MAX_TEXT - 3]}..."
    return f"{prefix}{shown}"


def is_wrapped(node, context):
    if isinstance(node, (ast.Tuple, ast.GeneratorExp)):
        return False
    return parenthesis_span(node, context) is not None
