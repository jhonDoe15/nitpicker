import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createScratch } from './fixtures/scratch.mjs';
import {
  pythonFileLimitFindings,
  readPythonStructureFindings,
  structure,
  STRUCTURE_REPORT,
} from './python-structure.mjs';

const scratch = createScratch();

afterEach(scratch.cleanup);

const SOURCE = [
  'class Service:',
  '    def handle(self, a, b, c):',
  '        return a',
  '',
  '    def run(self):',
  '        if self:',
  '            return 1',
  '',
].join('\n');

const project = (files = {}) =>
  scratch.project({ files: { 'src/demo/service.py': SOURCE, ...files } });

const entry = (fields) => ({
  file: 'src/demo/service.py',
  name: 'Service.handle',
  start: 2,
  end: 3,
  lines: 2,
  statements: 1,
  maxControlNesting: 0,
  parameters: 3,
  ...fields,
});

describe('the structure step', () => {
  it('runs the metrics script with the project python on the listed source files', () => {
    const { context, reportRoot } = project({
      'structure-data.json': JSON.stringify([entry({})]),
    });

    structure(context);

    expect(JSON.parse(readFileSync(path.join(reportRoot, STRUCTURE_REPORT), 'utf8'))).toEqual([
      entry({}),
    ]);
    expect(readFileSync(path.join(reportRoot, 'python-files.txt'), 'utf8')).toBe(
      'src/demo/service.py',
    );
  });

  it('fails with the structure-failed rule when the script fails', () => {
    const { context } = project({ 'fail.json': '{ "python": "SyntaxError in the script" }' });

    expect(() => {
      structure(context);
    }).toThrow(
      expect.objectContaining({
        rule: 'structure-failed',
        message: expect.stringContaining('SyntaxError in the script'),
      }),
    );
  });
});

describe('reading the structure report', () => {
  function findingsFor(entries, files) {
    const { root, reportRoot } = project(files);
    writeFileSync(path.join(reportRoot, STRUCTURE_REPORT), JSON.stringify(entries));
    return readPythonStructureFindings(reportRoot, root);
  }

  it('reports only the limit violations, with the shared messages', () => {
    const findings = findingsFor([
      entry({ parameters: 4 }),
      entry({ name: 'Service.run', start: 5, end: 7, parameters: 0, maxControlNesting: 3 }),
      entry({ name: 'Service.ok', parameters: 0 }),
    ]);

    expect(findings.map(({ rule, symbol, message }) => ({ rule, symbol, message }))).toEqual([
      {
        rule: 'function-parameters-limit',
        symbol: 'Service.handle',
        message:
          'Service.handle has 4 parameters; limit is 3. If this is intended, add {"rule":"function-parameters-limit","paths":["src/demo/service.py"],"function":"Service.handle","reason":"..."} to "exceptions" in nitpicker.config.json.',
      },
      {
        rule: 'function-control-nesting-limit',
        symbol: 'Service.run',
        message:
          'Service.run nests control flow 3 deep (limit 2). Return early instead of nesting. An elif chain counts one level per branch; use match, a dict lookup or a helper function. If this is intended, add {"rule":"function-control-nesting-limit","paths":["src/demo/service.py"],"function":"Service.run","reason":"..."} to "exceptions" in nitpicker.config.json.',
      },
    ]);
    expect(
      findings.every(
        ({ tool, classification }) => tool === 'structure' && classification === 'enforceable',
      ),
    ).toBe(true);
  });

  it('identifies a function by its name and text, not its line, and ratchets by name and metric', () => {
    const [before] = findingsFor([entry({ parameters: 4 })]);
    const [moved] = findingsFor([entry({ parameters: 4, start: 3, end: 4 })], {
      'src/demo/service.py': `\n${SOURCE}`,
    });
    const [edited] = findingsFor([entry({ parameters: 4, end: 2 })]);

    expect(moved.identity).toBe(before.identity);
    expect(edited.identity).not.toBe(before.identity);
    expect(edited.ratchet.key).toBe(before.ratchet.key);
    expect(before.ratchet).toEqual({
      key: 'function:Service.handle:occurrence:1:parameters',
      value: 4,
      worseMessage:
        'Service.handle grew from {base} to 4 parameters (limit 3). Group related parameters into one object instead of adding another. If this is intended, add {"rule":"function-parameters-limit","paths":["src/demo/service.py"],"function":"Service.handle","reason":"..."} to "exceptions" in nitpicker.config.json.',
      heldMessage:
        'Service.handle: 4 parameters (limit 3), allowed because base was {base}; any increase fails.',
    });
  });

  it('finds nothing when no function is over a limit', () => {
    expect(findingsFor([entry({})])).toEqual([]);
  });
});

let projectRoot;

function write(files, text = 'VALUE = 1\n') {
  for (const file of files) {
    mkdirSync(path.join(projectRoot, path.dirname(file)), { recursive: true });
    writeFileSync(path.join(projectRoot, file), text);
  }
}

function findingsWith(policy) {
  return pythonFileLimitFindings(projectRoot, policy).map(
    ({ rule, path: findingPath, identity }) => [rule, findingPath, identity],
  );
}

const limits = { folderFiles: 2 };

describe('Python file limits', () => {
  beforeEach(() => {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-file-limits-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('counts source and test modules apart, and skips non-Python files and tool folders', () => {
    write([
      'src/app/a.py',
      'src/app/b.py',
      'src/app/test_a.py',
      'src/app/test_b.py',
      'src/app/settings.toml',
      'src/app/README.md',
      'tests/test_a.py',
      'tests/test_b.py',
      'tests/conftest.py',
      '.venv/lib/x.py',
      'venv/lib/a.py',
      'venv/lib/b.py',
      'venv/lib/c.py',
      'env/lib/a.py',
      'env/lib/b.py',
      'env/lib/c.py',
      'src/app/__pycache__/a.py',
      'src/app/__pycache__/b.py',
      'src/app/__pycache__/c.py',
    ]);

    expect(findingsWith({ fileLimits: limits })).toEqual([
      ['folder-files-limit', 'tests', 'folder-files:test:3'],
    ]);
  });

  it('leaves package markers out of the folder count', () => {
    write(['pkg/__init__.py', 'pkg/a.py', 'pkg/b.py']);

    expect(findingsWith({ fileLimits: limits })).toEqual([]);
  });

  it('checks file and line length with the test-file limit for tests', () => {
    write(['src/app/long.py', 'tests/test_long.py'], 'VALUE = 1\n'.repeat(301));
    write(['src/app/wide.py'], `VALUE = ${'1 + '.repeat(40)}1\n`);

    expect(findingsWith({}).map(([rule, findingPath]) => [rule, findingPath])).toEqual([
      ['file-lines-limit', 'src/app/long.py'],
      ['line-length-limit', 'src/app/wide.py'],
    ]);
  });

  it('honours exclude and file-limit exceptions', () => {
    write(['src/gen/a.py', 'src/gen/b.py', 'src/gen/c.py', 'src/icons/a.py', 'src/icons/b.py']);
    write(['src/icons/c.py']);

    expect(
      findingsWith({
        exclude: ['src/gen/**'],
        fileLimits: limits,
        exceptions: [{ rule: 'folder-files-limit', paths: ['src/icons/*'] }],
      }),
    ).toEqual([]);
  });
});
