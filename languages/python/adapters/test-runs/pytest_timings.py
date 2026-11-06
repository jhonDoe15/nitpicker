import os
import sys
import time

import pytest
import pytest_console

MARKS_PROPERTY = "nitpicker_marks"


def covered_seconds(intervals):
    total, reach = 0.0, None
    for started, ended in sorted(intervals):
        start = started if reach is None else max(started, reach)
        total += max(0.0, ended - start)
        reach = ended if reach is None else max(reach, ended)
    return total


class FunctionSetupTimes:
    def __init__(self):
        self.current = None
        self.charged = {}
        self.shared = {}

    def record(self, spans, started):
        if self.current is not None:
            spans.setdefault(self.current, []).append((started, time.perf_counter()))

    @pytest.hookimpl(hookwrapper=True)
    def pytest_runtest_protocol(self, item, nextitem):
        self.current = item.nodeid
        yield
        self.current = None
        self.charged.pop(item.nodeid, None)
        self.shared.pop(item.nodeid, None)

    @pytest.hookimpl(hookwrapper=True)
    def pytest_fixture_setup(self, fixturedef, request):
        started = time.perf_counter()
        yield
        self.record(self.charged if fixturedef.scope == "function" else self.shared, started)

    @pytest.hookimpl(hookwrapper=True)
    def pytest_runtest_call(self, item):
        started = time.perf_counter()
        yield
        self.record(self.charged, started)

    @pytest.hookimpl(trylast=True)
    def pytest_collection_modifyitems(self, items):
        for item in items:
            names = sorted({mark.name for mark in item.iter_markers()})
            item.user_properties.append((MARKS_PROPERTY, " ".join(names)))

    def seconds(self, nodeid):
        shared = self.shared.get(nodeid, [])
        spans = self.charged.get(nodeid, []) + shared
        return covered_seconds(spans) - covered_seconds(shared)

    @pytest.hookimpl(hookwrapper=True)
    def pytest_runtest_makereport(self, item, call):
        outcome = yield
        if call.when == "call":
            outcome.get_result().duration = self.seconds(item.nodeid)


def main(arguments):
    sys.path[0] = os.getcwd()
    return pytest.main(arguments, plugins=[FunctionSetupTimes(), pytest_console])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
