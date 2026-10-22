import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { test } from '../test-runs/test-step.mjs';
import { createToolContext } from '../python-tools.mjs';
import { pythonE2eEnabled } from '../e2e/test-support/python-e2e-support.mjs';
import { readConsoleReport } from './console-output.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function directoryWith(prefix, files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

function consoleReport(files) {
  const root = directoryWith('nitpicker-pytest-report-', { 'pyproject.toml': '', ...files });
  const reportRoot = directoryWith('nitpicker-pytest-out-', {});
  const context = createToolContext({
    projectRoot: root,
    liveRoot: root,
    settings: { environment: 'path', testRunner: 'pytest', sourceRoots: ['src'] },
    reportRoot,
  });
  test(context, {});
  return { root, report: readConsoleReport(reportRoot).report };
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

describe.skipIf(!pythonE2eEnabled)('the pytest console plugin', () => {
  it('records what each test printed to stderr, logged or warned', () => {
    const { root, report } = consoleReport({
      'pyproject.toml': '[tool.pytest.ini_options]\nmarkers = ["integration"]\n',
      'src/shop/__init__.py': '',
      'tests/test_shop.py': SHOP_TEST,
    });
    const file = path.join(root, 'tests/test_shop.py');

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
    const { report } = consoleReport({
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
    const { root, report } = consoleReport({
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

  it('reports a logger that prints to stderr once', () => {
    const { report } = consoleReport({
      'tests/test_log.py': `import logging
import sys

LOG = logging.getLogger("shop")
LOG.addHandler(logging.StreamHandler(sys.stderr))


def test_logged():
    LOG.warning("cache is cold")
`,
    });

    expect(report.entries.map(({ messages }) => messages)).toEqual([['cache is cold']]);
  });

  it('records stderr printed while a test file is imported', () => {
    const { root, report } = consoleReport({
      'tests/test_import.py':
        'import sys\n\nprint("loading fixtures", file=sys.stderr)\n\n\ndef test_x():\n    pass\n',
    });

    expect(report.entries).toEqual([
      { file: path.join(root, 'tests/test_import.py'), test: '', messages: ['loading fixtures'] },
    ]);
  });

  it('still captures stderr when the project turns capture off', () => {
    const { report } = consoleReport({
      'pyproject.toml': '[tool.pytest.ini_options]\naddopts = "-s"\n',
      'tests/test_e.py':
        'import sys\n\n\ndef test_e():\n    print("disk almost full", file=sys.stderr)\n',
    });

    expect(report.entries.map(({ messages }) => messages)).toEqual([['disk almost full']]);
  });

  it('keeps a warning path on another drive absolute', () => {
    const result = spawnSync(
      'python',
      [
        '-B',
        '-c',
        [
          'import ntpath, sys, types',
          `sys.path.insert(0, ${JSON.stringify(path.join(import.meta.dirname, '../test-runs'))})`,
          'import pytest_console as plugin',
          'plugin.os = types.SimpleNamespace(path=ntpath)',
          'plugin.STATE["root"] = "C:\\\\work"',
          'print(plugin.relative_to_root("D:\\\\cache\\\\mod.py"))',
        ].join('\n'),
      ],
      { encoding: 'utf8', timeout: 60_000 },
    );

    expect(result.stdout.trim()).toBe(String.raw`D:\cache\mod.py`);
  });
});
