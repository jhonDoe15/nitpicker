import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanImports } from '../../analysis/python-coupling.mjs';
import { scanTestStrings } from '../../analysis/test-runtime/python-test-runtime.mjs';
import { run } from '../../execution/python-process.mjs';
import { createToolContext } from '../../python-tools.mjs';
import { pythonE2eEnabled } from '../test-support/python-e2e-support.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function scan(code) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-string-scan-')));
  const reportRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-string-report-')));
  roots.push(root, reportRoot);
  mkdirSync(path.join(root, 'src'));
  mkdirSync(path.join(root, 'tests'));
  writeFileSync(path.join(root, 'src/mod.py'), 'VALUE = 1\n');
  writeFileSync(path.join(root, 'tests/test_mod.py'), code);
  const context = createToolContext({
    projectRoot: root,
    liveRoot: root,
    settings: { environment: 'path', sourceRoots: ['src'] },
    reportRoot,
  });
  scanImports(context, run);
  scanTestStrings(context, run);
  return JSON.parse(readFileSync(path.join(reportRoot, 'string-literals.json'), 'utf8'));
}

describe.skipIf(!pythonE2eEnabled)('string literal scan of test files', () => {
  it('keeps the dotted names that call arguments and pytest_plugins give', () => {
    const code = [
      'import importlib',
      'import subprocess',
      'from unittest import mock',
      'pytest_plugins = ["tests.fixtures", "plain"]',
      'def test_it():',
      '    importlib.import_module("app.x")',
      '    importlib.import_module("single")',
      '    with mock.patch("app.service.requests"):',
      '        pass',
      '    subprocess.run(["python", "-m", "app.cli"])',
      '    subprocess.run(["python", "-m", "tool"])',
      '    assert name == "app.compared"',
      '    print("sentence. with a stop", "word")',
      '',
    ].join('\n');

    expect(scan(code)).toEqual({
      'tests/test_mod.py': {
        strings: ['app.cli', 'app.service.requests', 'app.x', 'single', 'tool'],
        plugins: ['plain', 'tests.fixtures'],
      },
    });
  });

  it('leaves out a file with no such string and a file that does not parse', () => {
    expect(scan('def test_it():\n    assert 1 + 1 == 2\n')).toEqual({});
    expect(scan('def test_it(:\n')).toEqual({});
  });
});
