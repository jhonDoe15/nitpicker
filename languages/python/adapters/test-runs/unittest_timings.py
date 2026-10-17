import inspect
import os
import sys
import time
import unittest
from xml.sax.saxutils import quoteattr


def located(test):
    method = getattr(test, getattr(test, "_testMethodName", ""), None)
    if method is None:
        return None
    try:
        source = inspect.getsourcefile(type(test))
        line = inspect.unwrap(method).__code__.co_firstlineno
        relative = os.path.relpath(source).replace(os.sep, "/")
    except (TypeError, AttributeError, OSError, ValueError):
        return None
    return None if relative.startswith("../") else (relative, line)


class TimedResult(unittest.TextTestResult):
    def __init__(self, *arguments, **options):
        super().__init__(*arguments, **options)
        self.timings = []
        self.started = {}

    def startTest(self, test):
        self.started[test.id()] = time.perf_counter()
        super().startTest(test)

    def stopTest(self, test):
        super().stopTest(test)
        started = self.started.pop(test.id(), None)
        where = located(test)
        if started is not None and where is not None:
            self.timings.append((test, where, time.perf_counter() - started))


def testcase(test, where, seconds):
    relative, line = where
    module = relative[: -len(".py")].replace("/", ".")
    owner = module + "." + type(test).__qualname__
    attributes = {
        "classname": owner,
        "name": test._testMethodName,
        "file": relative,
        "line": str(line - 1),
        "time": "%.3f" % seconds,
    }
    return "<testcase " + " ".join(k + "=" + quoteattr(v) for k, v in attributes.items()) + "/>"


def runner(report):
    class TimedRunner(unittest.TextTestRunner):
        resultclass = TimedResult

        def run(self, test):
            result = super().run(test)
            cases = "".join(testcase(*timing) for timing in result.timings)
            with open(report, "w", encoding="utf-8") as handle:
                handle.write("<testsuites><testsuite>" + cases + "</testsuite></testsuites>")
            return result

    return TimedRunner


def main(arguments):
    report, *rest = arguments
    sys.path[0] = os.getcwd()
    unittest.main(module=None, argv=["python -m unittest", *rest], testRunner=runner(report))


if __name__ == "__main__":
    main(sys.argv[1:])
