import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pythonE2eEnabled } from '../e2e/test-support/python-e2e-support.mjs';
import { createConsoleProjects } from './test-support/console-project.mjs';

const { consoleReport, cleanup } = createConsoleProjects();

afterEach(cleanup);

function byFile(root, report) {
  return report.entries.map(({ file, test, messages }) => [
    path.relative(root, file),
    test,
    messages,
  ]);
}

const LEGACY_CONNECT = `import warnings


def connect():
    warnings.warn("legacy connect is deprecated", DeprecationWarning, stacklevel=1)
    return "conn"
`;

const HANDLER_TESTS = `import logging
import logging.handlers
import queue
import sys


class EchoHandler(logging.Handler):
    def emit(self, record):
        print(self.format(record), file=sys.stderr)


def test_queue_listener():
    records = queue.Queue()
    queued = logging.handlers.QueueHandler(records)
    listener = logging.handlers.QueueListener(records, logging.StreamHandler(sys.stderr))
    log = logging.getLogger("queued")
    log.addHandler(queued)
    listener.start()
    log.warning("queued warning")
    listener.stop()
    log.removeHandler(queued)


def test_dev_stderr():
    stream = open("/dev/stderr", "w")
    handler = logging.StreamHandler(stream)
    log = logging.getLogger("device")
    log.addHandler(handler)
    log.warning("device warning")
    log.removeHandler(handler)
    stream.close()


def test_echo_handler():
    handler = EchoHandler()
    log = logging.getLogger("echo")
    log.addHandler(handler)
    log.warning("echoed warning")
    log.removeHandler(handler)
`;

describe.skipIf(!pythonE2eEnabled)('the pytest console plugin and test outcomes', () => {
  it('leaves a shared fixture warning to the project filters, which match it by module', () => {
    const { root, report, outcome } = consoleReport({
      'pyproject.toml': `[tool.pytest.ini_options]
pythonpath = ["src"]
filterwarnings = ["error", "default::DeprecationWarning:legacy.*"]
`,
      'src/legacy/__init__.py': LEGACY_CONNECT,
      'tests/conftest.py': `import pytest

from legacy import connect


@pytest.fixture(scope="session")
def conn():
    return connect()


@pytest.fixture
def conn_fn():
    return connect()
`,
      'tests/test_c.py':
        'def test_session(conn):\n    assert conn == "conn"\n\n\ndef test_function(conn_fn):\n    assert conn_fn == "conn"\n',
    });

    expect(outcome.testFailures).toEqual([]);
    expect(byFile(root, report)).toEqual([
      ['tests/conftest.py', '', ['DeprecationWarning: legacy connect is deprecated']],
      ['tests/test_c.py', 'test_function', ['DeprecationWarning: legacy connect is deprecated']],
    ]);
  });

  it('lets a log call that cannot be formatted pass when the project turns logging errors off', () => {
    const { outcome } = consoleReport({
      'tests/conftest.py': 'import logging\n\nlogging.raiseExceptions = False\n',
      'tests/test_fmt.py': `import logging

LOG = logging.getLogger("app")


class Unprintable:
    def __str__(self):
        raise RuntimeError("no str")


def test_bad_format_args():
    LOG.warning("value %d", "not-a-number")


def test_unprintable_message():
    LOG.warning(Unprintable())
`,
    });

    expect(outcome).toEqual({ testsRan: true, testFailures: [] });
  });

  it('gives a wrapped shared fixture its own conftest, not the module of the wrapper', () => {
    const { root, report } = consoleReport({
      'src/wrapping/__init__.py': `import functools


def wrapped(function):
    @functools.wraps(function)
    def run(*args, **kwargs):
        return function(*args, **kwargs)

    return run
`,
      'pyproject.toml': '[tool.pytest.ini_options]\npythonpath = ["src"]\n',
      'tests/conftest.py': `import logging

import pytest
from wrapping import wrapped


@pytest.fixture(scope="session")
@wrapped
def server():
    logging.getLogger("srv").warning("server up")
    return "srv"
`,
      'tests/test_s.py': 'def test_one(server):\n    assert server == "srv"\n',
    });

    expect(byFile(root, report)).toEqual([['tests/conftest.py', '', ['WARNING srv: server up']]]);
  });

  it('reports one message for a record a queue listener, a device stream or a custom handler prints', () => {
    const { report } = consoleReport({ 'tests/test_handlers.py': HANDLER_TESTS });

    expect(report.entries.map(({ test, messages }) => [test, messages])).toEqual([
      ['test_queue_listener', ['WARNING queued: queued warning']],
      ['test_dev_stderr', ['WARNING device: device warning']],
      ['test_echo_handler', ['WARNING echo: echoed warning']],
    ]);
  });

  it('does not report what caplog captured when the project also prints records to stderr', () => {
    const { report } = consoleReport({
      'tests/conftest.py': `import logging.config


def pytest_configure(config):
    logging.config.dictConfig({
        "version": 1,
        "handlers": {"console": {"class": "logging.StreamHandler"}},
        "root": {"handlers": ["console"], "level": "INFO"},
    })
`,
      'tests/test_cap.py': `import logging

LOG = logging.getLogger("app")


def test_expected(caplog):
    LOG.warning("expected by caplog")
    assert "expected by caplog" in caplog.text


def test_plain():
    LOG.warning("plain warning")
`,
    });

    expect(report.entries.map(({ test, messages }) => [test, messages])).toEqual([
      ['test_plain', ['plain warning']],
    ]);
  });
});
