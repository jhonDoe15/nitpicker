import io
import os
import re
import tokenize

from discovery.patterns import (
    DEFAULT_PYTHON_FILES,
    DEFAULT_UNITTEST_FILES,
    is_collected_file,
    option,
)
from source_text import refuse, replacement

NO_MUTATE = re.compile(
    r"#\s*pragma:\s*no mutate\b(?:[ \t]+(?:block|start|end|class|function))?"
)
TEST_WORDS = {"test", "tests"}


def stem_variants(stem):
    base = stem.removeprefix("tests_").removesuffix("_tests")
    return [f"test_{base}.py", f"{base}_test.py", f"test{base}.py"]


def collected_name(path, options):
    if options.get("testRunner", "pytest") == "unittest":
        patterns = DEFAULT_UNITTEST_FILES
    else:
        patterns = option(options, "pythonFiles", DEFAULT_PYTHON_FILES)
    directory, name = os.path.split(path)
    stem = os.path.splitext(name)[0]
    if stem.lower() in TEST_WORDS:
        refuse(
            "a file named tests or test has no module name to build a test name from"
        )
    for candidate in stem_variants(stem):
        target = f"{directory}/{candidate}" if directory else candidate
        if is_collected_file(target, patterns):
            return target
    refuse("no test file name matches the collection patterns")


def comment_removals(source):
    found = []
    tokens = tokenize.generate_tokens(io.StringIO(source.text[source.shift :]).readline)
    for token in tokens:
        if token.type != tokenize.COMMENT:
            continue
        for match in NO_MUTATE.finditer(token.string):
            found.append((token, match))
    return found


def mutate_removal(source, token, match):
    line_start = source.starts[token.start[0] - 1]
    comment = line_start + token.start[1]
    first = comment + match.start()
    rest = token.string[match.end() :]
    cut = rest.find("#")
    last = comment + match.end() + (len(rest) if cut < 0 else cut)
    before = source.text[line_start:first]
    if cut < 0 and before.strip() == "" and match.start() == 0:
        return replacement(
            line_start, line_start + len(source.lines[token.start[0] - 1]), ""
        )
    if cut < 0:
        while first > line_start and source.text[first - 1] in " \t":
            first -= 1
    return replacement(first, last, "")
