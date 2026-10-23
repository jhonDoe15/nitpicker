import inspect
import json
import logging
import os
import sys
import warnings

import pytest
from pytest_console_text import HAS_TEXT, stderr_messages

REPORT_VARIABLE = "NITPICKER_CONSOLE_REPORT"
STDERR_FD = 2
SHARED_SCOPES = {"session", "package", "module", "class"}
STATE = {
    "root": "",
    "current": None,
    "quiet_logs": False,
    "output": {},
    "claimed": {},
    "emitted": {},
    "streams": [],
    "fixtures": [],
    "capture": None,
}
CALL_HANDLERS = logging.Logger.callHandlers


def is_stderr(stream):
    if any(stream is known for known in (sys.stderr, sys.__stderr__, *STATE["streams"])):
        return True
    try:
        return stream.fileno() == STDERR_FD
    except (AttributeError, OSError, ValueError):
        return False


def remember_stderr():
    if not any(sys.stderr is known for known in STATE["streams"]):
        STATE["streams"].append(sys.stderr)


def printed_to_stderr(logger, record):
    found = 0
    while logger is not None:
        for handler in logger.handlers:
            found += 1
            if (
                isinstance(handler, logging.StreamHandler)
                and record.levelno >= handler.level
                and is_stderr(handler.stream)
            ):
                return True
        logger = logger.parent if logger.propagate else None
    last_resort = logging.lastResort
    return found == 0 and last_resort is not None and record.levelno >= last_resort.level


def reaches_root(logger):
    while logger.parent is not None:
        if not logger.propagate:
            return False
        logger = logger.parent
    return True


def note_emitted(key, text, reported):
    line = next((line.strip() for line in str(text).splitlines() if HAS_TEXT.search(line)), "")
    if line:
        STATE["emitted"].setdefault(key, []).append([line, reported])


def copied(key, message):
    matches = [entry for entry in STATE["emitted"].get(key, []) if entry[0] in message]
    fresh = next((entry for entry in matches if not entry[1]), None)
    if fresh is not None:
        fresh[1] = True
    return fresh is None and bool(matches)


def log_message(logger, record):
    if printed_to_stderr(logger, record):
        return record.getMessage(), None
    message = f"{record.levelname} {record.name}: {record.getMessage()}"
    if record.exc_info and record.exc_info[1] is not None:
        error = record.exc_info[1]
        message = f"{message} {type(error).__name__}: {error}"
    return record.getMessage(), message


def record_log(logger, record):
    key = STATE["current"]
    if key is None or STATE["quiet_logs"]:
        return
    try:
        text, message = log_message(logger, record)
    except Exception:
        return
    note_emitted(key, text, message is not None)
    if message is not None:
        add_message(key, message)


def recording_call_handlers(self, record):
    if record.levelno >= logging.WARNING and reaches_root(self):
        record_log(self, record)
    return CALL_HANDLERS(self, record)


def relative_to_root(path):
    try:
        return os.path.relpath(path, STATE["root"])
    except ValueError:
        return path


def file_and_test(nodeid):
    file, _, test = nodeid.partition("::")
    return (os.path.join(STATE["root"], file) if file else ""), test


def add_message(nodeid, message):
    STATE["output"].setdefault(nodeid, []).append(message)


def unclaimed(nodeid, message):
    claimed = STATE["claimed"].get(nodeid, [])
    if message in claimed:
        claimed.remove(message)
        return False
    return True


def add_stderr(report, title):
    for name, content in report.sections:
        if name == title:
            for message in stderr_messages(content):
                if unclaimed(report.nodeid, message) and not copied(report.nodeid, message):
                    add_message(report.nodeid, message)


def captured_stderr():
    capturing = getattr(STATE["capture"], "_global_capturing", None)
    tmpfile = getattr(getattr(capturing, "err", None), "tmpfile", None)
    try:
        tmpfile.flush()
        if hasattr(tmpfile, "getvalue"):
            return tmpfile.getvalue()
        buffer = tmpfile.buffer
        position = buffer.tell()
        buffer.seek(0)
        data = buffer.read()
        buffer.seek(position)
        return data.decode("utf-8", "replace")
    except (AttributeError, OSError, ValueError):
        return None


def fixture_key(fixturedef):
    if ".py" in fixturedef.baseid:
        return fixturedef.baseid
    try:
        source = inspect.getsourcefile(inspect.unwrap(fixturedef.func))
    except (TypeError, ValueError):
        source = None
    return relative_to_root(source) if source else ""


def warning_log():
    log = getattr(getattr(warnings, "_showwarnmsg_impl", None), "__self__", None)
    return log if isinstance(log, list) else None


def enter_fixture(key):
    log = warning_log()
    start = 0 if log is None else len(log)
    STATE["fixtures"].append((STATE["current"], STATE["quiet_logs"], captured_stderr(), log, start))
    STATE["current"], STATE["quiet_logs"] = key, False


def claim(owner, key, messages, printed):
    for message in messages:
        if not (printed and copied(key, message)):
            add_message(key, message)
        if owner is not None:
            STATE["claimed"].setdefault(owner, []).append(message)


def leave_fixture():
    key = STATE["current"]
    owner, quiet, before, log, start = STATE["fixtures"].pop()
    after = captured_stderr()
    if before is not None and after is not None and after.startswith(before):
        claim(owner, key, stderr_messages(after[len(before) :]), True)
    recorded = log[start:] if log is not None and warning_log() is log else []
    claim(owner, key, [warning_text(warning.category, warning.message) for warning in recorded], False)
    STATE["current"], STATE["quiet_logs"] = owner, quiet


@pytest.hookimpl(hookwrapper=True, tryfirst=True)
def pytest_load_initial_conftests(early_config, parser, args):
    if early_config.known_args_namespace.capture == "no":
        args.append("--capture=fd")
        early_config.known_args_namespace.capture = "fd"
    yield


@pytest.hookimpl(tryfirst=True)
def pytest_configure(config):
    STATE["root"] = str(config.rootdir)
    STATE["capture"] = config.pluginmanager.getplugin("capturemanager")
    logging.Logger.callHandlers = recording_call_handlers
    remember_stderr()


@pytest.hookimpl(tryfirst=True)
def pytest_runtest_setup(item):
    STATE["current"] = item.nodeid
    STATE["quiet_logs"] = "caplog" in getattr(item, "fixturenames", ())
    remember_stderr()


@pytest.hookimpl(hookwrapper=True)
def pytest_fixture_setup(fixturedef, request):
    if fixturedef.scope not in SHARED_SCOPES:
        yield
        return
    key = fixture_key(fixturedef)
    fixturedef.addfinalizer(leave_fixture)
    enter_fixture(key)
    try:
        yield
    finally:
        leave_fixture()
        fixturedef.addfinalizer(lambda: enter_fixture(key))


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    caplog = (getattr(item, "funcargs", None) or {}).get("caplog")
    try:
        records = [] if caplog is None else caplog.get_records(call.when)
        for record in records:
            note_emitted(item.nodeid, record.getMessage(), True)
    except Exception:
        pass
    yield


def pytest_runtest_logfinish(nodeid, location):
    STATE["current"] = None


def pytest_runtest_logreport(report):
    add_stderr(report, f"Captured stderr {report.when}")


def pytest_collectreport(report):
    add_stderr(report, "Captured stderr")


def warning_text(category, message):
    return f"{getattr(category, '__name__', 'Warning')}: {message}"


@pytest.hookimpl(optionalhook=True)
def pytest_warning_recorded(warning_message, when, nodeid, location):
    text = warning_text(warning_message.category, warning_message.message)
    if not unclaimed(nodeid, text):
        return
    source = location[0] if location else getattr(warning_message, "filename", "")
    if not nodeid and source:
        nodeid = relative_to_root(source)
    add_message(nodeid, text)


def report():
    entries = []
    for nodeid, messages in STATE["output"].items():
        file, test = file_and_test(nodeid)
        entries.append({"file": file, "test": test, "messages": messages})
    return {"entries": entries}


@pytest.hookimpl(tryfirst=True)
def pytest_unconfigure(config):
    logging.Logger.callHandlers = CALL_HANDLERS
    target = os.environ.get(REPORT_VARIABLE)
    if target:
        with open(target, "w", encoding="utf-8") as handle:
            json.dump(report(), handle)
