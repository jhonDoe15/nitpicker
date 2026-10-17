import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installFakeToolchain } from '../../test-support/fake-toolchain.mjs';
import { createToolContext } from '../../python-tools.mjs';

const roots = [];

const savedEnvironment = new Map();

export function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-tools-')));
  roots.push(root);
  return root;
}

export function coverageRc(...sources) {
  return [
    '[run]',
    'branch = True',
    'parallel = False',
    'source =',
    ...sources.map((source) => `    ${source}`),
    'omit =',
    '    test_*.py',
    '    *_test.py',
    '    tests.py',
    '    conftest.py',
    '    */tests/*',
    '    */test/*',
    '    testing/*',
    '[report]',
    'exclude_lines =',
    String.raw`    ^\s*if (typing\.)?TYPE_CHECKING:`,
    String.raw`    ^\s*if __name__ == .__main__.:`,
    String.raw`    ^\s*@(typing\.)?overload\b`,
    String.raw`    ^\s*raise NotImplementedError\b`,
    'partial_branches =',
    '',
  ].join('\n');
}

export function setEnvironment(name, value) {
  if (!savedEnvironment.has(name)) {
    savedEnvironment.set(name, process.env[name]);
  }
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
  } else {
    process.env[name] = value;
  }
}

export function restoreTemporaryState() {
  for (const [name, value] of savedEnvironment) {
    setEnvironment(name, value);
  }
  savedEnvironment.clear();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function project(files = {}, { tools } = {}) {
  const root = temporaryRoot();
  installFakeToolchain(path.join(root, '.venv/bin'), tools);
  mkdirSync(path.join(root, 'src/demo'), { recursive: true });
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), contents);
  }
  return root;
}

export function contextFor(root, settings = {}, exclude = []) {
  const reportRoot = temporaryRoot();
  return {
    context: createToolContext({
      projectRoot: root,
      liveRoot: root,
      settings,
      reportRoot,
      exclude,
    }),
    reportRoot,
  };
}

export function callsLog() {
  const log = path.join(temporaryRoot(), 'calls.jsonl');
  writeFileSync(log, '');
  setEnvironment('FAKE_PYTHON_LOG', log);
  return (tool, subcommand) =>
    readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((call) => call.tool === tool && call.args[0] === subcommand);
}

export function readReport(reportRoot, name) {
  return readFileSync(path.join(reportRoot, name), 'utf8');
}
