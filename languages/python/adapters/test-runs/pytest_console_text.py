import re

FRAME = re.compile(r'^\s+File ".*", line \d+')
TRACEBACK_HEADER = "Traceback (most recent call last):"
HAS_TEXT = re.compile(r"[A-Za-z0-9]")


def is_unindented(line):
    return line != "" and not line[0].isspace() and line[0] not in ")]}"


def call_blocks(text):
    blocks, current = [], []
    for line in text.splitlines():
        if is_unindented(line) and current:
            blocks.append(current)
            current = []
        current.append(line)
    return blocks + ([current] if current else [])


def block_message(lines):
    kept, skip_source = [], False
    for line in lines:
        if FRAME.match(line):
            skip_source = True
            continue
        if skip_source and line[:1].isspace():
            skip_source = False
            continue
        skip_source = False
        if HAS_TEXT.search(line) and line.strip() != TRACEBACK_HEADER:
            kept.append(line.strip())
    return " ".join(kept)


def stderr_messages(text):
    messages = [block_message(block) for block in call_blocks(text)]
    return [message for message in messages if message]
