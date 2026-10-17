import os
import sys
import time
import unittest
from xml.sax.saxutils import quoteattr


class TimedResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.timings = {}
        self.files = {}
        self.excluded = set()
        self.started = 0.0

    def startTest(self, test):
        self.started = time.perf_counter()
        super().startTest(test)

    def stopTest(self, test):
        elapsed = time.perf_counter() - self.started
        identifier = test.id()
        self.timings[identifier] = max(elapsed, self.timings.get(identifier, 0.0))
        self.files[identifier] = source_file(test)
        super().stopTest(test)

    def addFailure(self, test, err):
        self.excluded.add(test.id())
        super().addFailure(test, err)

    def addError(self, test, err):
        self.excluded.add(test.id())
        super().addError(test, err)

    def addSkip(self, test, reason):
        self.excluded.add(test.id())
        super().addSkip(test, reason)

    def addExpectedFailure(self, test, err):
        self.excluded.add(test.id())
        super().addExpectedFailure(test, err)

    def addSubTest(self, test, subtest, err):
        if err is not None:
            self.excluded.add(test.id())
        super().addSubTest(test, subtest, err)


def source_file(test):
    module = sys.modules.get(type(test).__module__)
    path = getattr(module, "__file__", None)
    if path is None:
        return None
    relative = os.path.relpath(path, os.getcwd())
    return None if relative.startswith("..") else relative.replace(os.sep, "/")


def write_times(path, result):
    cases = []
    for identifier, seconds in result.timings.items():
        if identifier in result.excluded:
            continue
        class_name, _, name = identifier.rpartition(".")
        file = result.files.get(identifier)
        located = "" if file is None else f" file={quoteattr(file)}"
        cases.append(
            f"<testcase classname={quoteattr(class_name)} name={quoteattr(name)}{located} "
            f'time="{seconds:.6f}"/>'
        )
    with open(path, "w", encoding="utf-8") as handle:
        handle.write('<testsuite name="unittest">' + "".join(cases) + "</testsuite>")


def make_runner(path):
    class TimedRunner(unittest.TextTestRunner):
        resultclass = TimedResult

        def run(self, test):
            result = super().run(test)
            write_times(path, result)
            return result

    return TimedRunner


if __name__ == "__main__":
    output, *arguments = sys.argv[1:]
    sys.path[0] = os.getcwd()
    unittest.main(
        module=None,
        argv=["python -m unittest", *arguments],
        testRunner=make_runner(output),
    )
