import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readMypyConfig, writeMypyConfig } from './mypy-config.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporary() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-mypy-config-')));
  roots.push(root);
  return root;
}

function generated(files, exclude = []) {
  const projectRoot = temporary();
  const reportRoot = temporary();
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(projectRoot, name), text);
  }
  const file = writeMypyConfig({ projectRoot, reportRoot, exclude });
  return { projectRoot, file: path.basename(file), text: readFileSync(file, 'utf8') };
}

describe('the mypy config nitpicker generates', () => {
  it('keeps the environment settings of a mypy.ini and drops everything that weakens the check', () => {
    const { projectRoot, file, text } = generated({
      'mypy.ini': [
        '# a comment',
        '[mypy]',
        'ignore_errors = True  ; weak',
        'disable_error_code =',
        '    no-untyped-def,',
        '    assignment',
        'warn_unused_ignores = False',
        'exclude = ^src/legacy/',
        'plugins =',
        '    ./tools/plugin.py:entry,',
        '    pydantic.mypy',
        'mypy_path = $MYPY_CONFIG_FILE_DIR/stubs',
        'python_version: 3.11',
        '',
        '[mypy-yaml.*,requests]',
        'ignore_missing_imports = True',
        'ignore_errors = True',
        '',
        '[mypy-app.legacy.*]',
        'disallow_untyped_defs = False',
        '',
        '[pydantic-mypy]',
        'init_forbid_extra = True',
        '',
      ].join('\n'),
    });

    expect(file).toBe('mypy.ini');
    expect(text).toBe(
      [
        '[mypy]',
        `plugins = ${path.join(projectRoot, 'tools/plugin.py')}:entry, pydantic.mypy`,
        `mypy_path = ${projectRoot}/stubs`,
        'python_version = 3.11',
        '',
        '[mypy-yaml.*,requests]',
        'ignore_missing_imports = True',
        '',
        '[pydantic-mypy]',
        'init_forbid_extra = True',
        '',
      ].join('\n'),
    );
  });

  it('keeps the environment settings of a pyproject table in the same format', () => {
    const { projectRoot, file, text } = generated({
      'pyproject.toml': [
        '[tool.black]',
        'line-length = 100',
        '',
        '[tool.mypy]',
        'strict = false',
        'ignore_errors = true',
        'mypy_path = ["$MYPY_CONFIG_FILE_DIR/stubs", "other"]',
        'plugins = ["./plugin.py", "numpy.typing.mypy_plugin"]',
        '',
        '[[tool.mypy.overrides]]',
        'module = ["a.*", "b"]',
        'follow_imports = "silent"',
        'ignore_errors = true',
        '',
        '[[tool.mypy.overrides]]',
        'module = "tests.*"',
        'disallow_untyped_defs = false',
        '',
        '[tool.pydantic-mypy]',
        'init_typed = true',
        '',
      ].join('\n'),
    });

    expect(file).toBe('pyproject.toml');
    expect(text).toBe(
      [
        '[tool.black]',
        'line-length = 100',
        '',
        '[tool.pydantic-mypy]',
        'init_typed = true',
        '',
        '[tool.mypy]',
        `plugins = [ "${path.join(projectRoot, 'plugin.py')}", "numpy.typing.mypy_plugin" ]`,
        `mypy_path = [ "${projectRoot}/stubs", "other" ]`,
        '',
        '[[tool.mypy.overrides]]',
        'module = [ "a.*", "b" ]',
        'follow_imports = "silent"',
        '',
      ].join('\n'),
    );
  });

  it('reads setup.cfg after the dedicated files, and only when it has a mypy section', () => {
    const plain = generated({ 'setup.cfg': '[flake8]\nmax-line-length = 100\n' });
    const shared = generated({
      'setup.cfg': '[mypy]\npython_version = 3.9\n',
      'mypy.ini': '[mypy]\npython_version = 3.12\n',
    });

    expect(plain.text).toBe('[mypy]\n');
    expect(shared.text).toBe('[mypy]\npython_version = 3.12\n');
    expect(readMypyConfig(temporary())).toBeUndefined();
  });

  it('names the file and the parse problem of a pyproject.toml that is not valid TOML', () => {
    expect(() => generated({ 'pyproject.toml': '[tool.mypy\nstrict = true\n' })).toThrow(
      'pyproject.toml is not valid TOML, so the mypy settings cannot be read: Invalid TOML document: illegal character in key (line 1, column 11)',
    );
  });

  it('writes an empty mypy section for a project without mypy settings', () => {
    expect(generated({}).text).toBe('[mypy]\n');
  });

  it('excludes the nitpicker exclude globs as one regular expression', () => {
    const { text } = generated({}, ['src/gen/**', '**/*_pb2.py', 'build']);
    const pattern = new RegExp(/^exclude = (.+)$/m.exec(text)[1]);

    expect(
      [
        'src/gen/',
        'src/gen/a.py',
        'src/gen/deep/b.py',
        'src/x/a_pb2.py',
        'build/',
        'build/x.py',
      ].map((file) => pattern.test(file)),
    ).toEqual([true, true, true, true, true, true]);
    expect(
      ['src/generated.py', 'src/a.py', 'buildings/a.py'].map((file) => pattern.test(file)),
    ).toEqual([false, false, false]);
  });
});
