import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  hasImportLinterConfig,
  importLinterEnabled,
  readImportLinterFindings,
  runImportLinter,
} from './python-import-linter.mjs';

const roots = [];

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-linter-')));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = temporaryRoot();
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), contents);
  }
  return root;
}

describe('detecting an import-linter configuration', () => {
  it.each([
    ['.importlinter', '[importlinter]\nroot_package = app\n'],
    ['setup.cfg', '[metadata]\nname = app\n\n[importlinter]\nroot_package = app\n'],
    ['pyproject.toml', '[project]\nname = "app"\n\n[tool.importlinter]\nroot_package = "app"\n'],
  ])('finds it in %s', (file, contents) => {
    expect(hasImportLinterConfig(project({ [file]: contents }))).toBe(true);
  });

  it.each([
    ['no configuration files', {}],
    ['a setup.cfg without the section', { 'setup.cfg': '[metadata]\nname = app\n' }],
    ['a pyproject.toml of another tool', { 'pyproject.toml': '[tool.ruff]\nline-length = 99\n' }],
    ['a .importlinter without the section', { '.importlinter': '[other]\n' }],
    ['a tox.ini, which import-linter never reads', { 'tox.ini': '[importlinter]\n[tox]\n' }],
  ])('does not find it with %s', (_, files) => {
    expect(hasImportLinterConfig(project(files))).toBe(false);
  });

  it('lets the setting override the detection', () => {
    const configured = project({ '.importlinter': '[importlinter]\n' });
    const bare = project({});

    expect(importLinterEnabled(configured, undefined)).toBe(true);
    expect(importLinterEnabled(configured, false)).toBe(false);
    expect(importLinterEnabled(bare, undefined)).toBe(false);
    expect(importLinterEnabled(bare, true)).toBe(true);
  });
});

describe('running import-linter', () => {
  function context(files, importLinter) {
    return {
      projectRoot: project(files),
      reportRoot: temporaryRoot(),
      project: { importLinter },
    };
  }

  const CONFIGURED = { '.importlinter': '[importlinter]\nroot_package = app\n' };

  it('does nothing without a configuration', () => {
    const setup = context({});

    runImportLinter(setup, () => {
      throw new Error('should not run');
    });

    expect(() => readFileSync(path.join(setup.reportRoot, 'import-linter.txt'))).toThrow();
  });

  it('runs the contracts without a cache and keeps the report', () => {
    const setup = context(CONFIGURED);
    const calls = [];

    runImportLinter(setup, (_, command, options) => {
      calls.push({ command, options });
      return { stdout: 'Contracts: 1 kept, 0 broken.\n', stderr: '' };
    });

    expect(calls).toEqual([
      {
        command: ['lint-imports', '--no-cache'],
        options: {
          accepted: [0, 1],
          rule: 'import-linter-failed',
          notFoundHint: ', or turn the contracts off with "python": { "importLinter": false }',
        },
      },
    ]);
    expect(readFileSync(path.join(setup.reportRoot, 'import-linter.txt'), 'utf8')).toBe(
      'Contracts: 1 kept, 0 broken.\n',
    );
  });

  it('runs when the setting asks for it without a configuration', () => {
    const setup = context({}, true);
    let ran = false;

    runImportLinter(setup, () => {
      ran = true;
      return { stdout: 'Contracts: 0 kept, 0 broken.\n', stderr: '' };
    });

    expect(ran).toBe(true);
  });

  it('does not run when the setting turns it off', () => {
    const setup = context(CONFIGURED, false);

    expect(() => {
      runImportLinter(setup, () => {
        throw new Error('should not run');
      });
    }).not.toThrow();
  });

  it('reports output without a contract summary as a failure with its output', () => {
    const setup = context(CONFIGURED);

    expect(() => {
      runImportLinter(setup, () => ({
        stdout: 'Could not find .importlinter.\n',
        stderr: 'Traceback: boom\n',
      }));
    }).toThrow(
      expect.objectContaining({
        rule: 'import-linter-failed',
        message:
          'lint-imports could not check the contracts:\nCould not find .importlinter.\n\nTraceback: boom',
      }),
    );
  });

  it('says so when the failing run printed nothing', () => {
    const setup = context(CONFIGURED);

    expect(() => {
      runImportLinter(setup, () => ({ stdout: '', stderr: '' }));
    }).toThrow('lint-imports could not check the contracts:\nno diagnostic output');
  });

  it('keeps the end of a long failure output', () => {
    const setup = context(CONFIGURED);

    expect(() => {
      runImportLinter(setup, () => ({ stdout: `${'x'.repeat(4000)}THE END`, stderr: '' }));
    }).toThrow(/^lint-imports could not check the contracts:\nx+THE END$/);
  });
});

describe('reading import-linter findings', () => {
  const BROKEN = [
    'Naughty BROKEN',
    'Contracts: 0 kept, 1 broken.',
    'Broken contracts',
    'Naughty',
    '-------',
    '- app.a -> app.b (l.3)',
    '',
  ].join('\n');

  it('reports nothing when import-linter did not run', () => {
    expect(readImportLinterFindings(temporaryRoot())).toEqual([]);
  });

  it('maps modules to the files of the import scan', () => {
    const reportRoot = temporaryRoot();
    writeFileSync(path.join(reportRoot, 'import-linter.txt'), BROKEN);
    writeFileSync(
      path.join(reportRoot, 'imports.json'),
      JSON.stringify({
        modules: [{ module: 'app.a', file: 'src/app/a.py', isPackage: false }],
        imports: {},
      }),
    );

    expect(readImportLinterFindings(reportRoot)).toEqual([
      {
        tool: 'import-linter',
        rule: 'contract-broken',
        path: 'src/app/a.py',
        identity: 'contract:Naughty:app.a -> app.b',
        message: 'Import contract "Naughty" is broken: app.a -> app.b. Remove the import.',
        classification: 'enforceable',
        location: { line: 3 },
      },
    ]);
  });
});
