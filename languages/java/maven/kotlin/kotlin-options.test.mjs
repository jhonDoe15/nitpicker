import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readPinnedTools } from '../../builds/java-build.mjs';
import { kotlinSetup } from './kotlin-options.mjs';

const roots = [];
const pinned = readPinnedTools();

function directory(files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-options-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function setup({
  preset = 'kotlin',
  modules = [{ kotlin: {} }],
  effectivePom = '',
  files,
  policy,
}) {
  const projectRoot = directory(files);
  const work = directory();
  return {
    projectRoot,
    work,
    result: kotlinSetup({
      projectRoot,
      policy: { preset, ...policy },
      modules,
      effectivePom,
      work,
      pinned,
    }),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('kotlinSetup', () => {
  it('does nothing under the java preset', () => {
    expect(setup({ preset: 'java', modules: [{}] }).result).toEqual({
      extraTools: [],
      options: undefined,
    });
  });

  it('fails early on a project without kotlin-maven-plugin and points at the java preset', () => {
    expect(() => setup({ modules: [{}, {}] })).toThrow(
      new Error(
        'The kotlin preset needs a Maven project that applies kotlin-maven-plugin; this one does not. Use the java preset for its Java sources',
      ),
    );
  });

  it('follows the formatter the effective POM names, ktlint before ktfmt', () => {
    expect(
      setup({ effectivePom: '<artifactId>ktlint-maven-plugin</artifactId>' }).result.options,
    ).toMatchObject({ formatter: 'ktlint', ktfmtStyle: 'meta', editorconfig: false });
    expect(
      setup({ effectivePom: '<ktfmt><style>KOTLINLANG</style></ktfmt>' }).result.options,
    ).toMatchObject({ formatter: 'ktfmt', ktfmtStyle: 'kotlinlang' });
    expect(setup({ effectivePom: '<name>plain</name>' }).result.options.formatter).toBe('none');
  });

  it('lets kotlin.formatter win and reads the editorconfig of the project', () => {
    const { result } = setup({
      effectivePom: '<artifactId>ktlint-maven-plugin</artifactId>',
      files: { '.editorconfig': 'root = true\n' },
      policy: { kotlinFormatter: 'ktfmt' },
    });

    expect(result.options).toMatchObject({ formatter: 'ktfmt', editorconfig: true });
    expect(result.extraTools.map(({ name }) => name)).toEqual([
      'kotlin-compiler',
      'detekt',
      'detekt-stdlib',
      'ktfmt',
    ]);
  });

  it('uses the detekt config of the project and merges its forbidden calls into a lists file outside the project', () => {
    const { result, projectRoot, work } = setup({
      files: {
        'config/detekt/detekt.yml':
          'style:\n  ForbiddenMethodCall:\n    methods:\n      - value: java.lang.Thread.sleep\n        reason: no sleeping\n',
      },
    });

    expect(result.options.detektConfig).toBe(path.join(projectRoot, 'config/detekt/detekt.yml'));
    expect(result.options.detektLists).toBe(path.join(work, 'detekt-lists.yml'));
    expect(readFileSync(result.options.detektLists, 'utf8')).toContain('java.lang.Thread.sleep');
  });

  it('rejects a configured detekt config that does not exist on head and ignores it on base', () => {
    expect(() =>
      setup({ policy: { kotlinDetektConfig: 'missing.yml', snapshot: 'head' } }),
    ).toThrow(new Error('"kotlin.detektConfig" is missing.yml, which does not exist'));
    expect(
      setup({ policy: { kotlinDetektConfig: 'missing.yml', snapshot: 'base' } }).result.options
        .detektConfig,
    ).toBeUndefined();
  });
});
