import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  excludePattern,
  mypyExcludeArguments,
  readMypyConfig,
  writeMypyConfig,
} from './mypy-config.mjs';

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

function generated(files, exclude = [], extra = {}) {
  const projectRoot = temporary();
  const reportRoot = temporary();
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(projectRoot, name)), { recursive: true });
    writeFileSync(path.join(projectRoot, name), text);
  }
  const file = writeMypyConfig({
    projectRoot,
    reportRoot,
    exclude,
    project: { sourceRoots: ['.'] },
    ...extra,
  });
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

describe('per-module sections that would silence the project own modules', () => {
  const files = {
    'src/shop/__init__.py': '',
    'src/helper.py': '',
    'mypy.ini': [
      '[mypy]',
      '[mypy-shop.*]',
      'follow_imports = skip',
      'ignore_missing_imports = True',
      '[mypy-helper]',
      'ignore_missing_imports = True',
      '[mypy-shop.vendored,yaml.*,requests]',
      'follow_imports = silent',
      '[mypy-*.generated]',
      'ignore_missing_imports = True',
      '[mypy-numpy.*]',
      'ignore_missing_imports = True',
      '',
    ].join('\n'),
  };

  it('keeps only the sections of modules the project does not own', () => {
    const { text } = generated(files, [], { project: { sourceRoots: ['src'] } });

    expect(text).toBe(
      [
        '[mypy]',
        '',
        '[mypy-yaml.*,requests]',
        'follow_imports = silent',
        '',
        '[mypy-numpy.*]',
        'ignore_missing_imports = True',
        '',
      ].join('\n'),
    );
  });

  it('drops a wildcard section that could reach any module, and an own module of a toml table', () => {
    const { text } = generated(
      {
        'src/shop/__init__.py': '',
        'pyproject.toml': [
          '[tool.mypy]',
          '[[tool.mypy.overrides]]',
          'module = ["shop.*", "attrs"]',
          'ignore_missing_imports = true',
          '[[tool.mypy.overrides]]',
          'module = "*"',
          'follow_imports = "skip"',
          '',
        ].join('\n'),
      },
      [],
      { project: { sourceRoots: ['src'] } },
    );

    expect(text).toBe(
      ['[[tool.mypy.overrides]]', 'module = [ "attrs" ]', 'ignore_missing_imports = true', ''].join(
        '\n',
      ),
    );
  });
});

describe('the mypy config with tools.mypy listing the project', () => {
  const listed = (root) => ({
    toolPrecedence: { mypy: ['project', 'nitpicker'] },
    policyRoot: root,
  });
  const PYPROJECT = [
    '[tool.mypy]',
    'disallow_untyped_defs = false',
    'exclude = ["^legacy/"]',
    'plugins = ["pydantic.mypy"]',
    '',
    '[[tool.mypy.overrides]]',
    'module = "shop.*"',
    'ignore_errors = true',
    '',
  ].join('\n');

  function layered(files, exclude, precedence) {
    const projectRoot = temporary();
    const reportRoot = temporary();
    for (const [name, text] of Object.entries(files)) {
      writeFileSync(path.join(projectRoot, name), text);
    }
    const file = writeMypyConfig({
      projectRoot,
      reportRoot,
      exclude,
      project: { sourceRoots: ['.'] },
      ...(precedence ?? listed(projectRoot)),
    });
    return readFileSync(file, 'utf8');
  }

  it('puts strict first and lets every key the project sets override it', () => {
    expect(layered({ 'pyproject.toml': PYPROJECT }, ['src/gen/**'])).toBe(
      [
        '[tool.mypy]',
        'strict = true',
        'disallow_untyped_defs = false',
        'plugins = [ "pydantic.mypy" ]',
        'exclude = [ "^legacy/" ]',
        '',
        '[[tool.mypy.overrides]]',
        'module = [ "shop.*" ]',
        'ignore_errors = true',
        '',
      ].join('\n'),
    );
  });

  it('passes the project exclude through untouched, so an inline (?x) keeps working', () => {
    const verbose = '[mypy]\nexclude = (?x)(\n    ^legacy/\n    | ^gen/\n  )\n';

    expect(layered({ 'mypy.ini': verbose }, ['src/gen/**'])).toBe(
      '[mypy]\nstrict = true\nexclude = (?x)(\n    ^legacy/\n    | ^gen/\n    )\n',
    );
  });

  it('gives nitpicker exclude to the command line, where it adds to the project one', () => {
    const exclude = ['src/gen/**'];
    const listedContext = { exclude, toolPrecedence: { mypy: ['project'] }, policyRoot: '/p' };

    expect(mypyExcludeArguments(listedContext)).toEqual(['--exclude', excludePattern(exclude)]);
    expect(mypyExcludeArguments({ exclude: [], toolPrecedence: { mypy: ['project'] } })).toEqual(
      [],
    );
    expect(mypyExcludeArguments({ exclude })).toEqual([]);
  });

  it('is nitpicker strictness alone for a project that sets nothing', () => {
    expect(layered({ 'mypy.ini': '[mypy]\n' }, [])).toBe('[mypy]\nstrict = true\n');
  });

  it('keeps the isolated config when nitpicker is listed first', () => {
    const precedence = (root) => ({
      toolPrecedence: { mypy: ['nitpicker', 'project'] },
      policyRoot: root,
    });
    const projectRoot = temporary();
    writeFileSync(path.join(projectRoot, 'pyproject.toml'), PYPROJECT);
    const reportRoot = temporary();
    const file = writeMypyConfig({
      projectRoot,
      reportRoot,
      exclude: [],
      project: { sourceRoots: ['.'] },
      ...precedence(projectRoot),
    });

    expect(readFileSync(file, 'utf8')).toBe('[tool.mypy]\nplugins = [ "pydantic.mypy" ]\n');
  });

  it('names the missing config', () => {
    expect(() => layered({}, [])).toThrow(
      /^"tools\.mypy\.precedence" lists "project" but a mypy config \(.+\) is missing/u,
    );
  });
});

describe('own modules found beyond the source roots', () => {
  const sections = [
    '[mypy]',
    'mypy_path = $MYPY_CONFIG_FILE_DIR/stubs:lib',
    '[mypy-typed_stub]',
    'follow_imports = silent',
    '[mypy-libmod.*]',
    'ignore_missing_imports = True',
    '[mypy-pkg_stubs]',
    'follow_imports = skip',
    '[mypy-loose]',
    'follow_imports = silent',
    '[mypy-yaml]',
    'ignore_missing_imports = True',
    '',
  ].join('\n');

  it('drops sections for packages under mypy_path, stub files and stub packages', () => {
    const { projectRoot, text } = generated(
      {
        'src/pkg/__init__.py': '',
        'stubs/typed_stub.pyi': '',
        'lib/libmod/__init__.py': '',
        'src/pkg_stubs/__init__.pyi': '',
        'src/loose.pyi': '',
        'mypy.ini': sections,
      },
      [],
      { project: { sourceRoots: ['src'] } },
    );

    expect(text).toBe(
      [
        '[mypy]',
        `mypy_path = ${projectRoot}/stubs:lib`,
        '',
        '[mypy-yaml]',
        'ignore_missing_imports = True',
        '',
      ].join('\n'),
    );
  });
});

describe('where mypy finds its config', () => {
  it('stops at a mypy.ini without a mypy section and uses its module sections only', () => {
    const { text } = generated({
      'mypy.ini': '[mypy-yaml]\nignore_missing_imports = True\n',
      'setup.cfg': '[mypy]\npython_version = 3.9\n',
    });

    expect(text).toBe('[mypy]\n\n[mypy-yaml]\nignore_missing_imports = True\n');
  });

  it('skips a pyproject.toml without a mypy table, and a setup.cfg without a mypy section', () => {
    const { text } = generated({
      'pyproject.toml': '[tool.black]\nline-length = 100\n',
      'setup.cfg': '[mypy]\npython_version = 3.9\n',
    });

    expect(text).toBe('[mypy]\npython_version = 3.9\n');
  });

  it('names a pyproject.toml it cannot parse', () => {
    expect(() => generated({ 'pyproject.toml': '[tool.mypy\nx = 1\n' })).toThrow(
      /^pyproject\.toml could not be parsed \([\s\S]+\): fix it$/u,
    );
  });
});

describe('the project config of the head read for the snapshot', () => {
  it('resolves plugin files and the config directory variable against the snapshot', () => {
    const head = temporary();
    const snapshot = temporary();
    writeFileSync(
      path.join(head, 'mypy.ini'),
      '[mypy]\nplugins = tools/plugin.py\nmypy_path = $MYPY_CONFIG_FILE_DIR/stubs\n',
    );
    const file = writeMypyConfig({
      projectRoot: snapshot,
      reportRoot: temporary(),
      exclude: [],
      project: { sourceRoots: ['.'] },
      toolPrecedence: { mypy: ['project', 'nitpicker'] },
      policyRoot: head,
    });

    expect(readFileSync(file, 'utf8')).toBe(
      `[mypy]\nstrict = true\nplugins = ${path.join(snapshot, 'tools/plugin.py')}\nmypy_path = ${snapshot}/stubs\n`,
    );
  });
});
