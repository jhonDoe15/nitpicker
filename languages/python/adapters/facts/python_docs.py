import ast
import re

from review.common import scoped_definitions

FIELD_LIST = re.compile(
    r"^:(?:param|parameter|arg|argument|key|keyword|type|raises?|except|exception|returns?|rtype"
    r"|yields?|ytype|var|ivar|cvar|vartype|meta)\b"
)
SECTION_NAMES = (
    r"Args|Arguments|Parameters|Params|Returns?|Yields?|Raises|Examples?|Notes?|Attributes"
    r"|See Also|Warnings?|Warns|Todo|References|Other Parameters|Keyword Args|Keyword Arguments"
    r"|Methods"
)
SECTION = re.compile(rf"^(?:{SECTION_NAMES})(?:\s+[\w.]+)?:(?:\s+(.*))?$")
UNDERLINE = re.compile(r"^-{3,}\s*$")
CODE_FENCE = re.compile(r"^(?:```|~~~)")
CODE_DIRECTIVE = re.compile(r"^\.\.\s+(?:code-block|code|sourcecode|doctest|testcode|testoutput)::")
DIRECTIVE = re.compile(r"^\.\.\s+[\w:-]+::")
HAS_TEXT = re.compile(r"\w")
FIELD_PREFIX = re.compile(r"^:[^:]+:")
DOCTEST = ">>>"


def starts_section(lines, index):
    line = lines[index]
    following = lines[index + 1].strip() if index + 1 < len(lines) else ""
    return bool(FIELD_LIST.match(line) or SECTION.match(line)) or (
        line != "" and UNDERLINE.match(following) is not None
    )


def indent_of(line):
    return len(line) - len(line.lstrip())


def opens_literal_block(line):
    return line.endswith("::") and not DIRECTIVE.match(line)


def split_docstring(docstring):
    raw = docstring.split("\n")
    lines = [line.strip() for line in raw]
    prose, code, block, fenced, doctest = [], [], None, False, False
    for index, line in enumerate(lines):
        indent = indent_of(raw[index])
        if (block is not None and (line == "" or indent > block)) or (doctest and line):
            code.append(line)
            continue
        block, doctest = None, False
        if CODE_FENCE.match(line) or fenced:
            fenced = fenced != bool(CODE_FENCE.match(line))
            code.append(line)
        elif line.startswith(DOCTEST):
            doctest = True
            code.append(line)
        elif starts_section(lines, index):
            return prose, code + lines[index:]
        elif CODE_DIRECTIVE.match(line):
            block = indent
            code.append(line)
        else:
            block = indent if opens_literal_block(line) else None
            prose.extend([line] if line else [])
    return prose, code


def content_of(lines, index):
    line = lines[index]
    following = lines[index + 1] if index + 1 < len(lines) else ""
    section = SECTION.match(line)
    if section:
        return section.group(1) or ""
    if UNDERLINE.match(line) or UNDERLINE.match(following):
        return ""
    return FIELD_PREFIX.sub("", line)


def has_content(lines):
    return any(HAS_TEXT.search(content_of(lines, index)) for index in range(len(lines)))




def doc_comments(tree):
    found = []
    for node, scope in scoped_definitions(tree):
        docstring = ast.get_docstring(node, clean=True)
        if docstring:
            prose, other = split_docstring(docstring)
            found.append(
                {
                    "line": node.body[0].lineno,
                    "name": node.name,
                    "qualifier": ".".join(scope),
                    "lines": prose,
                    "detailed": has_content(other),
                }
            )
    return sorted(found, key=lambda entry: entry["line"])


def is_main_guard(statement):
    test = getattr(statement, "test", None)
    return (
        isinstance(statement, ast.If)
        and isinstance(test, ast.Compare)
        and isinstance(test.left, ast.Name)
        and test.left.id == "__name__"
        and len(test.comparators) == 1
        and isinstance(test.comparators[0], ast.Constant)
        and test.comparators[0].value == "__main__"
    )


def is_script(tree):
    return any(is_main_guard(statement) for statement in tree.body)
