import os
import sys
import time

import pytest

MARKS_PROPERTY = "nitpicker_marks"


class FunctionSetupTimes:
    def __init__(self):
        self.setup = {}

    @pytest.hookimpl(hookwrapper=True)
    def pytest_fixture_setup(self, fixturedef, request):
        started = time.perf_counter()
        yield
        if fixturedef.scope == "function":
            key = request.node.nodeid
            self.setup[key] = self.setup.get(key, 0.0) + time.perf_counter() - started

    @pytest.hookimpl(trylast=True)
    def pytest_collection_modifyitems(self, items):
        for item in items:
            names = sorted({mark.name for mark in item.iter_markers()})
            item.user_properties.append((MARKS_PROPERTY, " ".join(names)))

    @pytest.hookimpl(hookwrapper=True)
    def pytest_runtest_makereport(self, item, call):
        outcome = yield
        if call.when == "call":
            outcome.get_result().duration += self.setup.get(item.nodeid, 0.0)
        if call.when == "teardown":
            self.setup.pop(item.nodeid, None)


def main(arguments):
    sys.path[0] = os.getcwd()
    return pytest.main(arguments, plugins=[FunctionSetupTimes()])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
