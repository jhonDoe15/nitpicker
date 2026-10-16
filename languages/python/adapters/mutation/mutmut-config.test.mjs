import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeMutmutConfig } from '../project-tools/mutmut/mutmut-config.mjs';
import { section, TEST_PATTERNS } from './test-support/mutmut-section.mjs';

const roots = [];

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-mutmut-config-')));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function write(root, files) {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
}

function configurationContext(files = {}, overrides = {}) {
  const projectRoot = temporaryRoot();
  write(projectRoot, files);
  return { projectRoot, project: { sourceRoots: ['src'] }, exclude: [], ...overrides };
}

const read = (root, file) => readFileSync(path.join(root, file), 'utf8');

const failure = (message) => new Error(message);
const ensureMutmutConfiguration = (context) => {
  writeMutmutConfig({ context, fail: failure });
};
const LISTED = { mutmut: ['project', 'nitpicker'] };

describe('the mutmut configuration', () => {
  it('adds the source roots and the test patterns when the project has no mutmut configuration', () => {
    const context = configurationContext({ 'pyproject.toml': '[project]\nname = "demo"\n' });

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      `[project]\nname = "demo"\n\n${section(['src'])}`,
    );
  });

  it('creates pyproject.toml when the project has none', () => {
    const context = configurationContext({}, { project: { sourceRoots: ['pkg', 'lib'] } });

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(`\n${section(['pkg', 'lib'])}`);
  });

  it('keeps mutmut away from the excluded paths, the files and the directories below them', () => {
    const context = configurationContext(
      {},
      { exclude: ['legacy/**', 'src/demo/old.py', 'vendor/'] },
    );

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      `\n${section(
        ['src'],
        [
          ...TEST_PATTERNS,
          'legacy/**',
          'legacy/**/*',
          'src/demo/old.py',
          'src/demo/old.py/*',
          'vendor/',
          'vendor/*',
        ],
      )}`,
    );
  });

  it('replaces the [tool.mutmut] table of the project, keeping only what the run needs', () => {
    const own = [
      '[project]',
      'name = "demo"',
      '',
      '[tool.mutmut]',
      'source_paths = ["app"]',
      'do_not_mutate = ["src/*"]',
      'only_mutate = ["src/a.py"]',
      'also_copy = ["data/"]',
      'process_isolation = "forkserver"',
      'max_stack_depth = 3',
      'mutate_only_covered_lines = true',
      '',
      '[tool.ruff]',
      'line-length = 100',
      '',
    ].join('\n');
    const context = configurationContext({ 'pyproject.toml': own });

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      [
        '[project]',
        'name = "demo"',
        '',
        '[tool.ruff]',
        'line-length = 100',
        '',
        section(['src']).trimEnd(),
        'also_copy = [ "data/" ]',
        'process_isolation = "forkserver"',
        '',
      ].join('\n'),
    );
  });

  it('takes also_copy from the setup.cfg section and puts nitpicker section in pyproject.toml', () => {
    const context = configurationContext({
      'setup.cfg':
        '[mutmut]\nsource_paths=app\nalso_copy=\n  data/\n  fixtures/\ndo_not_mutate=src/*\n',
    });

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      `\n${section(['src']).trimEnd()}\nalso_copy = [ "data/", "fixtures/" ]\n`,
    );
  });

  it('asks for the directories to mutate when neither nitpicker nor the project names them', () => {
    const context = configurationContext({}, { project: { sourceRoots: ['.'] } });

    expect(() => {
      ensureMutmutConfiguration(context);
    }).toThrow(
      /set "python.sourceRoots" in nitpicker.config.json or source_paths in \[tool.mutmut\]/,
    );
  });

  it('takes the source paths from the project when the source roots are the whole project', () => {
    const context = configurationContext(
      { 'pyproject.toml': '[tool.mutmut]\npaths_to_mutate = ["app"]\ndo_not_mutate = ["app/*"]\n' },
      { project: { sourceRoots: ['.'] } },
    );

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(`\n${section(['app'])}`);
  });
});

describe('the mutmut configuration with tools.mutmut listing the project', () => {
  const policy = (context) => ({ toolPrecedence: LISTED, policyRoot: context.projectRoot });

  it('lets the project override the keys it sets and keeps the test patterns', () => {
    const own = [
      '[tool.mutmut]',
      'source_paths = ["app"]',
      'do_not_mutate = ["app/generated/*"]',
      'mutate_only_covered_lines = true',
      'timeout_multiplier = 3',
      '',
    ].join('\n');
    const context = configurationContext({ 'pyproject.toml': own }, { exclude: ['legacy/**'] });

    ensureMutmutConfiguration({ ...context, ...policy(context) });

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      `\n${section(['app'], [...TEST_PATTERNS, 'legacy/**', 'legacy/**/*', 'app/generated/*']).trimEnd()}\nmutate_only_covered_lines = true\ntimeout_multiplier = 3\n`,
    );
  });

  it('reads the setup.cfg section with typed values', () => {
    const context = configurationContext({
      'setup.cfg': '[mutmut]\nmutate_only_covered_lines=true\ntimeout_multiplier=2.5\n',
    });

    ensureMutmutConfiguration({ ...context, ...policy(context) });

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      `\n${section(['src']).trimEnd()}\nmutate_only_covered_lines = true\ntimeout_multiplier = 2.5\n`,
    );
  });

  it('keeps the isolated configuration when nitpicker is listed first', () => {
    const context = configurationContext({
      'pyproject.toml': '[tool.mutmut]\nonly_mutate = ["src/a.py"]\nalso_copy = ["data/"]\n',
    });

    ensureMutmutConfiguration({
      ...context,
      toolPrecedence: { mutmut: ['nitpicker', 'project'] },
      policyRoot: context.projectRoot,
    });

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      `\n${section(['src']).trimEnd()}\nalso_copy = [ "data/" ]\n`,
    );
  });

  it('reads the config of the head and writes it into the snapshot', () => {
    const head = temporaryRoot();
    write(head, {
      'pyproject.toml': '[tool.mutmut]\nsource_paths = ["app"]\nmutate_only_covered_lines = true\n',
    });
    const context = configurationContext({ 'pyproject.toml': '[project]\nname = "base"\n' });

    ensureMutmutConfiguration({ ...context, toolPrecedence: LISTED, policyRoot: head });

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      `[project]\nname = "base"\n\n${section(['app']).trimEnd()}\nmutate_only_covered_lines = true\n`,
    );
  });

  it('names a pyproject.toml it cannot parse, with or without the opt-in', () => {
    const broken = { 'pyproject.toml': '[tool.mutmut\nsource_paths = 1\n' };
    const context = configurationContext(broken);

    expect(() => {
      ensureMutmutConfiguration(context);
    }).toThrow(/^pyproject\.toml could not be parsed \([\s\S]+\): fix it$/u);
    expect(() => {
      ensureMutmutConfiguration({ ...context, ...policy(context) });
    }).toThrow(/^pyproject\.toml could not be parsed \([\s\S]+\): fix it$/u);
  });

  it('names the missing config', () => {
    const context = configurationContext({});

    expect(() => {
      ensureMutmutConfiguration({ ...context, ...policy(context) });
    }).toThrow(/^"tools\.mutmut\.precedence" lists "project" but a mutmut config .+ is missing/u);
  });
});
