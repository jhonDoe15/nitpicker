import json
import logging
import os
import re

import pytest

REPORT_VARIABLE = "NITPICKER_PYTEST_REPORT"
FRAME = re.compile(r'^\s+File ".*", line \d+')
TRACEBACK_HEADER = "Traceback (most recent call last):"
HAS_TEXT = re.compile(r"[A-Za-z0-9]")
STATE = {"root": "", "current": None, "quiet_logs": False, "tests": {}, "output": {}}


class WarningRecorder(logging.Handler):
    def emit(self, record):
        nodeid = STATE["current"]
        if nodeid is None or STATE["quiet_logs"]:
            return
        message = f"{record.levelname} {record.name}: {record.getMessage()}"
        if record.exc_info and record.exc_info[1] is not None:
            error = record.exc_info[1]
            message = f"{message} {type(error).__name__}: {error}"
        add_message(nodeid, message)


RECORDER = WarningRecorder(logging.WARNING)


def file_and_test(nodeid):
    file, _, test = nodeid.partition("::")
    return (os.path.join(STATE["root"], file) if file else ""), test


def add_message(nodeid, message):
    STATE["output"].setdefault(nodeid, []).append(message)


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


@pytest.hookimpl(tryfirst=True)
def pytest_configure(config):
    STATE["root"] = str(config.rootdir)
    logging.getLogger().addHandler(RECORDER)


@pytest.hookimpl(tryfirst=True)
def pytest_runtest_setup(item):
    STATE["current"] = item.nodeid
    STATE["quiet_logs"] = "caplog" in getattr(item, "fixturenames", ())
    entry = STATE["tests"].setdefault(item.nodeid, {"seconds": 0.0})
    entry["markers"] = sorted({marker.name for marker in item.iter_markers()})


def pytest_runtest_logfinish(nodeid, location):
    STATE["current"] = None


def pytest_runtest_logreport(report):
    entry = STATE["tests"].setdefault(report.nodeid, {"seconds": 0.0, "markers": []})
    entry["seconds"] += report.duration or 0.0
    title = f"Captured stderr {report.when}"
    for name, content in report.sections:
        if name == title:
            for message in stderr_messages(content):
                add_message(report.nodeid, message)


@pytest.hookimpl(optionalhook=True)
def pytest_warning_recorded(warning_message, when, nodeid, location):
    category = getattr(warning_message.category, "__name__", "Warning")
    source = location[0] if location else getattr(warning_message, "filename", "")
    if not nodeid and source:
        nodeid = os.path.relpath(source, STATE["root"])
    add_message(nodeid, f"{category}: {warning_message.message}")


def report():
    tests = []
    for nodeid, entry in STATE["tests"].items():
        file, test = file_and_test(nodeid)
        tests.append({"nodeid": nodeid, "file": file, "test": test, **entry})
    entries = []
    for nodeid, messages in STATE["output"].items():
        file, test = file_and_test(nodeid)
        entries.append({"file": file, "test": test, "messages": messages})
    return {"tests": tests, "entries": entries}


def pytest_unconfigure(config):
    logging.getLogger().removeHandler(RECORDER)
    target = os.environ.get(REPORT_VARIABLE)
    if target:
        with open(target, "w", encoding="utf-8") as handle:
            json.dump(report(), handle)
