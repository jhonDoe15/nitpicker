import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createJavaAnalyzer } from '../../languages/java/adapters/java-analyzer.mjs';
import { createPythonAnalyzers } from '../../languages/python/adapters/python-analyzer.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import { configureAnalyzers } from './configure-analyzers.mjs';
import { validateConfig } from './validate.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-style-hash-'));
  roots.push(root);
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), contents);
  }
  return root;
}

function edit(root, relative, contents) {
  writeFileSync(path.join(root, relative), contents);
}

function pythonHash(config) {
  const full = { preset: 'python', ...config };
  const [analyzer] = configureAnalyzers(createPythonAnalyzers(), full, resolveHeadPolicy(full));
  return (root) => analyzer.resolveConfigurationHash(root);
}

function mutationHash(config) {
  const full = { preset: 'python', ...config };
  const [, analyzer] = configureAnalyzers(createPythonAnalyzers(), full, resolveHeadPolicy(full));
  return (root) => analyzer.resolveConfigurationHash(root);
}

function kotlinHash(config) {
  const full = { preset: 'kotlin', ...config };
  const [analyzer] = configureAnalyzers(
    [createJavaAnalyzer({ kotlin: true })],
    full,
    resolveHeadPolicy(full),
  );
  return (root) => analyzer.resolveConfigurationHash(root);
}

describe('the cache key of the Python analyzer', () => {
  it('follows the ruff config even when the project is not listed, since it decides the files', () => {
    const root = project({ 'ruff.toml': 'exclude = ["gen"]\n' });
    const hash = pythonHash({});
    const before = hash(root);

    edit(root, 'ruff.toml', 'exclude = ["gen", "old"]\n');

    expect(hash(root)).not.toBe(before);
  });

  it('follows every config the ruff extend chain names, wherever it is', () => {
    const root = project({
      '.git/HEAD': '',
      'shared/base.toml': 'line-length = 100\n',
      'svc/ruff.toml': 'extend = "../shared/base.toml"\n',
    });
    const service = path.join(root, 'svc');
    const hash = pythonHash({});
    const before = hash(service);

    edit(root, 'shared/base.toml', 'line-length = 120\n');

    expect(hash(service)).not.toBe(before);
  });

  it('follows the ruff and black configs found above the project', () => {
    const root = project({
      '.git/HEAD': '',
      'pyproject.toml': '[tool.ruff]\nline-length = 100\n',
      'svc/a.py': '',
    });
    const service = path.join(root, 'svc');
    const hash = pythonHash({ python: { formatter: 'black' } });
    const before = hash(service);

    edit(root, 'pyproject.toml', '[tool.ruff]\nline-length = 100\n[tool.black]\nexclude = "/x/"\n');

    expect(hash(service)).not.toBe(before);
  });

  it('follows the pyright config and the base file it extends', () => {
    const root = project({
      'pyrightconfig.json': '{ "extends": "base/pyright.json" }',
      'base/pyright.json': '{ "pythonVersion": "3.10" }',
    });
    const hash = pythonHash({});
    const before = hash(root);

    edit(root, 'base/pyright.json', '{ "pythonVersion": "3.12" }');

    expect(hash(root)).not.toBe(before);
  });

  it('follows the mypy config', () => {
    const root = project({ 'mypy.ini': '[mypy]\nplugins = a\n' });
    const hash = pythonHash({});
    const before = hash(root);

    edit(root, 'mypy.ini', '[mypy]\nplugins = b\n');

    expect(hash(root)).not.toBe(before);
  });

  it('stays the same for a project with no config, and for an unrelated file', () => {
    const root = project({ 'a.py': '' });
    const hash = pythonHash({});
    const before = hash(root);

    edit(root, 'a.py', 'x = 1\n');

    expect(hash(root)).toBe(before);
  });
});

describe('the cache key of the mutation analyzer', () => {
  it('follows the mutmut section of the project', () => {
    const root = project({ 'pyproject.toml': '[tool.mutmut]\npaths_to_mutate = ["src"]\n' });
    const hash = mutationHash({});
    const before = hash(root);

    edit(root, 'pyproject.toml', '[tool.mutmut]\npaths_to_mutate = ["lib"]\n');

    expect(hash(root)).not.toBe(before);
  });
});

describe('the cache key of the Kotlin analyzer', () => {
  const listed = { tools: { ktlint: { precedence: ['project'] } } };

  it('follows the nested and the ancestor .editorconfig files of a listed project', () => {
    const repository = project({
      '.git/HEAD': '',
      '.editorconfig': 'indent_size = 2\n',
      'app/.editorconfig': 'indent_size = 4\n',
      'app/src/main/kotlin/.editorconfig': '[*.kt]\nindent_size = 8\n',
      'app/build.gradle.kts': 'ktlint',
    });
    const root = path.join(repository, 'app');
    const hash = kotlinHash(listed);
    const before = hash(root);

    edit(repository, '.editorconfig', 'indent_size = 3\n');
    const afterAncestor = hash(root);
    edit(root, 'src/main/kotlin/.editorconfig', '[*.kt]\nindent_size = 6\n');

    expect(afterAncestor).not.toBe(before);
    expect(hash(root)).not.toBe(afterAncestor);
  });

  it('ignores the .editorconfig files when ktlint does not list the project', () => {
    const root = project({ 'build.gradle.kts': 'ktlint', '.editorconfig': 'indent_size = 2\n' });
    const hash = kotlinHash({});
    const before = hash(root);

    edit(root, '.editorconfig', 'indent_size = 8\n');

    expect(hash(root)).toBe(before);
  });

  it('follows the content of a custom detekt config, wherever the path points', () => {
    const root = project({ 'tools/rules.yml': 'style:\n', 'build.gradle.kts': 'plugins {}' });
    const hash = kotlinHash({ kotlin: { detektConfig: 'tools/rules.yml' } });
    const before = hash(root);

    edit(root, 'tools/rules.yml', 'style:\n  MagicNumber:\n    active: false\n');

    expect(hash(root)).not.toBe(before);
  });

  it('follows the detekt config of a listed project', () => {
    const root = project({ 'detekt.yml': 'style:\n' });
    const hash = kotlinHash({ tools: { detekt: { precedence: ['project'] } } });
    const before = hash(root);

    edit(root, 'detekt.yml', 'style:\n  MagicNumber:\n    active: false\n');

    expect(hash(root)).not.toBe(before);
  });
});

describe('tool precedence of the formatters and detekt', () => {
  it('names ruff and black with the python preset, and the formatters with the kotlin preset', () => {
    const python = {
      ruff: { precedence: ['nitpicker', 'project'] },
      black: { precedence: ['project'] },
    };
    const kotlin = {
      ktlint: { precedence: ['project', 'nitpicker'] },
      ktfmt: { precedence: ['project'] },
      detekt: { precedence: ['nitpicker', 'project'] },
    };

    expect(validateConfig({ preset: 'python', tools: python }).tools).toEqual(python);
    expect(validateConfig({ preset: 'kotlin', tools: kotlin }).tools).toEqual(kotlin);
    expect(() =>
      validateConfig({ preset: 'java', tools: { ktlint: { precedence: ['project'] } } }),
    ).toThrow(
      '"tools" names unknown tool "ktlint". Supported tools with this preset: pmd, checkstyle, jscpd',
    );
    expect(() => validateConfig({ preset: 'python', tools: { ruff: { precedence: [] } } })).toThrow(
      '"tools.ruff.precedence" must list "project", "nitpicker" or both, each once',
    );
  });

  it('names the type checkers and mutmut with the python preset, and not basedpyright', () => {
    const tools = {
      pyright: { precedence: ['project', 'nitpicker'] },
      mypy: { precedence: ['project'] },
      mutmut: { precedence: ['nitpicker', 'project'] },
    };

    expect(validateConfig({ preset: 'python', tools }).tools).toEqual(tools);
    expect(() =>
      validateConfig({ preset: 'python', tools: { basedpyright: { precedence: ['project'] } } }),
    ).toThrow(
      '"tools" names unknown tool "basedpyright". Supported tools with this preset: ruff, black, pyright, mypy, mutmut, jscpd',
    );
  });

  it.each([['ktlint'], ['ktfmt']])(
    'asks for the project first with %s, which reads .editorconfig itself',
    (tool) => {
      expect(() =>
        validateConfig({
          preset: 'kotlin',
          tools: { [tool]: { precedence: ['nitpicker', 'project'] } },
        }),
      ).toThrow(`"tools.${tool}.precedence" must list "project" first`);
      expect(
        validateConfig({ preset: 'kotlin', tools: { [tool]: { precedence: ['nitpicker'] } } }),
      ).toBeDefined();
    },
  );

  it('asks for the project first with black, which cannot switch string normalization on', () => {
    expect(() =>
      validateConfig({
        preset: 'python',
        tools: { black: { precedence: ['nitpicker', 'project'] } },
      }),
    ).toThrow(
      '"tools.black.precedence" must list "project" first: black has no flag that switches string normalization back on',
    );
    expect(
      validateConfig({
        preset: 'python',
        tools: { black: { precedence: ['project', 'nitpicker'] } },
      }),
    ).toBeDefined();
  });
});
