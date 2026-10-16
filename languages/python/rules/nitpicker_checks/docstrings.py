import ast
import re

from nitpicker_checks.common import finding

STOPWORDS = set(
    """a an the this that of for to in on by with and or is are be it its get gets set sets return
    returns function method class component hook type value given new current specified provided""".split()
)
SUFFIXES = (("ing", "e"), ("ed", "e"), ("es", ""), ("s", ""))
MIN_STEM_LENGTH = 3
MAX_DESCRIPTION_LINES = 5
FIELD_LIST = re.compile(
    r"^:(?:param|parameter|arg|argument|key|keyword|type|raises?|except|exception|returns?|rtype"
    r"|yields?|ytype|var|ivar|cvar|vartype|meta)\b"
)
SECTION = re.compile(
    r"^(?:Args|Arguments|Parameters|Params|Returns?|Yields?|Raises|Examples?|Notes?|Attributes"
    r"|See Also|Warnings?|Warns|Todo|References|Other Parameters|Keyword Args|Keyword Arguments"
    r"|Methods):\s*$"
)
UNDERLINE = re.compile(r"^-{3,}\s*$")
CODE_FENCE = re.compile(r"^(?:```|~~~)")
DOCTEST = ">>>"


def words_of(text):
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    text = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", text)
    text = re.sub(r"([A-Za-z])(\d)", r"\1 \2", text)
    text = re.sub(r"(\d)([A-Za-z])", r"\1 \2", text)
    return [word.lower() for word in re.split(r"[^A-Za-z0-9]+", text) if word]


def stem_variants(word):
    variants = [word]
    for suffix, extra in SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= MIN_STEM_LENGTH:
            stem = word[: -len(suffix)]
            variants.extend([stem, stem + extra] if extra else [stem])
    return variants


def starts_section(lines, index):
    line = lines[index]
    following = lines[index + 1].strip() if index + 1 < len(lines) else ""
    return (
        bool(FIELD_LIST.match(line) or SECTION.match(line))
        or line.startswith(DOCTEST)
        or (line != "" and UNDERLINE.match(following) is not None)
    )


def description_lines(docstring):
    lines = [line.strip() for line in docstring.split("\n")]
    description = []
    inside_fence = False
    for index, line in enumerate(lines):
        if CODE_FENCE.match(line):
            inside_fence = not inside_fence
        if not inside_fence and starts_section(lines, index):
            break
        if line:
            description.append(line)
    return description


def restates_name(docstring, name):
    description = words_of(" ".join(description_lines(docstring)))
    name_stems = {variant for word in words_of(name) for variant in stem_variants(word)}
    return bool(description) and all(
        any(variant in name_stems for variant in stem_variants(word))
        for word in description
        if word not in STOPWORDS
    )


def docstring_findings(path, scoped):
    found = []
    for node, scope in scoped:
        docstring = ast.get_docstring(node, clean=True)
        if not docstring:
            continue
        subject = ".".join(scope)
        line = node.body[0].lineno
        lines = len(description_lines(docstring))
        if restates_name(docstring, node.name):
            found.append(finding("restating-docstring", path, subject, line))
        elif lines > MAX_DESCRIPTION_LINES:
            data = {"lines": lines, "limit": MAX_DESCRIPTION_LINES}
            found.append(finding("long-docstring", path, subject, line, data))
    return found
