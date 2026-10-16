import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { test } from '../execution/python-test-step.mjs';
import { createToolContext } from '../python-tools.mjs';
import { pythonE2eEnabled } from '../e2e/test-support/python-e2e-support.mjs';
import { readPytestReport } from './slow-tests.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function pytestReport(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-pytest-report-')));
  const reportRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-pytest-out-')));
  roots.push(root, reportRoot);
  for (const [file, content] of Object.entries({ 'pyproject.toml': '', ...files })) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  const context = createToolContext({
    projectRoot: root,
    liveRoot: root,
    settings: { environment: 'path', testRunner: 'pytest', sourceRoots: ['src'] },
    reportRoot,
  });
  test(context, {});
  return { root, report: readPytestReport(reportRoot) };
}

const SHOP_TEST = `import logging
import sys
import warnings

import pytest

LOG = logging.getLogger("shop")


def test_quiet():
    print("progress goes to stdout")


def test_stderr():
    print("disk almost full", file=sys.stderr)


def test_logged():
    LOG.warning("rate is %s", 0)
    LOG.info("not counted")


def test_logged_on_purpose(caplog):
    LOG.warning("checked by the test")
    assert "checked" in caplog.text


def test_traceback():
    try:
        raise ValueError("bad input")
    except ValueError:
        LOG.exception("parse failed")


def test_warns():
    warnings.warn("old call", DeprecationWarning)


@pytest.mark.integration
@pytest.mark.parametrize("value", [1, 2])
def test_marked(value):
    assert value
`;

describe.skipIf(!pythonE2eEnabled)('the pytest report plugin', () => {
  it('records each test with its time and markers, and what it printed', () => {
    const { root, report } = pytestReport({
      'pyproject.toml': '[tool.pytest.ini_options]\nmarkers = ["integration"]\n',
      'src/shop/__init__.py': '',
      'tests/test_shop.py': SHOP_TEST,
    });
    const file = path.join(root, 'tests/test_shop.py');

    expect(report.tests.map(({ test, markers }) => [test, markers])).toEqual([
      ['test_quiet', []],
      ['test_stderr', []],
      ['test_logged', []],
      ['test_logged_on_purpose', []],
      ['test_traceback', []],
      ['test_warns', []],
      ['test_marked[1]', ['integration', 'parametrize']],
      ['test_marked[2]', ['integration', 'parametrize']],
    ]);
    expect(report.tests.every((entry) => entry.file === file && entry.seconds >= 0)).toBe(true);
    expect(report.entries).toEqual([
      { file, test: 'test_stderr', messages: ['disk almost full'] },
      { file, test: 'test_logged', messages: ['WARNING shop: rate is 0'] },
      {
        file,
        test: 'test_traceback',
        messages: ['ERROR shop: parse failed ValueError: bad input'],
      },
      { file, test: 'test_warns', messages: ['DeprecationWarning: old call'] },
    ]);
  });

  it('splits a stderr traceback into one message without its frames', () => {
    const { report } = pytestReport({
      'tests/test_trace.py': `import sys
import traceback


def test_printed():
    try:
        {}["missing"]
    except KeyError:
        traceback.print_exc()
    print("second line", file=sys.stderr)
`,
    });

    expect(report.entries.map(({ messages }) => messages)).toEqual([
      ["KeyError: 'missing'", 'second line'],
    ]);
  });

  it('gives a collection warning to its file, with no test name', () => {
    const { root, report } = pytestReport({
      'tests/test_marks.py': 'import pytest\n\n\n@pytest.mark.slowish\ndef test_x():\n    pass\n',
    });

    expect(report.entries).toEqual([
      {
        file: path.join(root, 'tests/test_marks.py'),
        test: '',
        messages: [
          expect.stringMatching(/^PytestUnknownMarkWarning: Unknown pytest\.mark\.slowish/),
        ],
      },
    ]);
  });
});
