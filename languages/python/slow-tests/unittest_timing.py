import os
import sys
import time
import unittest
from xml.sax.saxutils import quoteattr


class TimedResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.timings = {}
        self.started = 0.0

    def startTest(self, test):
        self.started = time.perf_counter()
        super().startTest(test)

    def stopTest(self, test):
        elapsed = time.perf_counter() - self.started
        self.timings[test.id()] = max(elapsed, self.timings.get(test.id(), 0.0))
        super().stopTest(test)


def write_times(path, timings):
    cases = []
    for identifier, seconds in timings.items():
        class_name, _, name = identifier.rpartition(".")
        cases.append(
            f"<testcase classname={quoteattr(class_name)} name={quoteattr(name)} "
            f'time="{seconds:.6f}"/>'
        )
    with open(path, "w", encoding="utf-8") as handle:
        handle.write('<testsuite name="unittest">' + "".join(cases) + "</testsuite>")


def make_runner(path):
    class TimedRunner(unittest.TextTestRunner):
        resultclass = TimedResult

        def run(self, test):
            result = super().run(test)
            write_times(path, result.timings)
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
