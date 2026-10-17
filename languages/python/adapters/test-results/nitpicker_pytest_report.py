import json
import logging
import os
import re
import sys
import time

import pytest
from nitpicker_test_sources import Sources

REPORT_VARIABLE = "NITPICKER_PYTEST_REPORT"
BASELINE_VARIABLE = "NITPICKER_BASELINE_ROOT"
FRAME = re.compile(r'^\s+File ".*", line \d+')
TRACEBACK_HEADER = "Traceback (most recent call last):"
HAS_TEXT = re.compile(r"[A-Za-z0-9]")
STDERR_FD = 2
STATE = {
    "root": "",
    "current": None,
    "quiet_logs": False,
    "tests": {},
    "output": {},
    "functions": {},
    "teardowns": {},
}


def is_stderr(stream):
    if stream is sys.stderr or stream is sys.__stderr__:
        return True
    try:
        return stream.fileno() == STDERR_FD
    except (AttributeError, OSError, ValueError):
        return False


def printed_to_stderr(record):
    logger = logging.getLogger(record.name)
    while logger is not None:
        for handler in logger.handlers:
            if (
                isinstance(handler, logging.StreamHandler)
                and record.levelno >= handler.level
                and is_stderr(handler.stream)
            ):
                return True
        logger = logger.parent if logger.propagate else None
    return False


class WarningRecorder(logging.Handler):
    def emit(self, record):
        nodeid = STATE["current"]
        if nodeid is None or STATE["quiet_logs"] or printed_to_stderr(record):
            return
        message = f"{record.levelname} {record.name}: {record.getMessage()}"
        if record.exc_info and record.exc_info[1] is not None:
            error = record.exc_info[1]
            message = f"{message} {type(error).__name__}: {error}"
        add_message(nodeid, message)


RECORDER = WarningRecorder(logging.WARNING)


def relative_to_root(path):
    try:
        return os.path.relpath(path, STATE["root"])
    except ValueError:
        return path


def entry_of(nodeid):
    return STATE["tests"].setdefault(nodeid, {"seconds": 0.0, "sharedSeconds": 0.0, "markers": []})


def add_shared(seconds):
    nodeid = STATE["current"]
    if nodeid is not None:
        entry_of(nodeid)["sharedSeconds"] += seconds


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


def add_stderr(report, title):
    for name, content in report.sections:
        if name == title:
            for message in stderr_messages(content):
                add_message(report.nodeid, message)


@pytest.hookimpl(hookwrapper=True, tryfirst=True)
def pytest_load_initial_conftests(early_config, parser, args):
    if early_config.known_args_namespace.capture == "no":
        args.append("--capture=fd")
        early_config.known_args_namespace.capture = "fd"
    yield


@pytest.hookimpl(tryfirst=True)
def pytest_configure(config):
    STATE["root"] = str(config.rootdir)
    logging.getLogger().addHandler(RECORDER)


@pytest.hookimpl(hookwrapper=True)
def pytest_fixture_setup(fixturedef, request):
    started = time.perf_counter()
    yield
    if fixturedef.scope != "function":
        add_shared(time.perf_counter() - started)
        fixturedef.addfinalizer(
            lambda: STATE["teardowns"].update({id(fixturedef): time.perf_counter()})
        )


def pytest_fixture_post_finalizer(fixturedef, request):
    started = STATE["teardowns"].pop(id(fixturedef), None)
    if started is not None:
        add_shared(time.perf_counter() - started)


@pytest.hookimpl(tryfirst=True)
def pytest_runtest_setup(item):
    STATE["current"] = item.nodeid
    STATE["quiet_logs"] = "caplog" in getattr(item, "fixturenames", ())
    entry_of(item.nodeid)["markers"] = sorted({marker.name for marker in item.iter_markers()})
    function = getattr(item, "function", None)
    if function is not None:
        STATE["functions"][item.nodeid] = function


def pytest_runtest_logfinish(nodeid, location):
    STATE["current"] = None


def pytest_runtest_logreport(report):
    entry_of(report.nodeid)["seconds"] += report.duration or 0.0
    add_stderr(report, f"Captured stderr {report.when}")


def pytest_collectreport(report):
    add_stderr(report, "Captured stderr")


@pytest.hookimpl(optionalhook=True)
def pytest_warning_recorded(warning_message, when, nodeid, location):
    category = getattr(warning_message.category, "__name__", "Warning")
    source = location[0] if location else getattr(warning_message, "filename", "")
    if not nodeid and source:
        nodeid = relative_to_root(source)
    add_message(nodeid, f"{category}: {warning_message.message}")


def test_entry(nodeid, entry, sources):
    file, test = file_and_test(nodeid)
    charged = max(0.0, entry["seconds"] - entry["sharedSeconds"])
    found = {"nodeid": nodeid, "file": file, "test": test, **entry, "seconds": charged}
    function = STATE["functions"].get(nodeid)
    source = None if function is None else sources.describe(function)
    return found if source is None else {**found, "source": source}


def report():
    sources = Sources(os.getcwd(), os.environ.get(BASELINE_VARIABLE))
    tests = [test_entry(nodeid, entry, sources) for nodeid, entry in STATE["tests"].items()]
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
