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
    ).toMatchObject({ formatter: 'ktlint', ktfmtStyle: 'meta', ktfmtEditorconfig: false });
    expect(
      setup({ effectivePom: '<ktfmt><style>KOTLINLANG</style></ktfmt>' }).result.options,
    ).toMatchObject({ formatter: 'ktfmt', ktfmtStyle: 'meta' });
    expect(
      setup({
        effectivePom: '<ktfmt><style>KOTLINLANG</style></ktfmt>',
        policy: { toolPrecedence: { ktfmt: ['project', 'nitpicker'] } },
      }).result.options,
    ).toMatchObject({ formatter: 'ktfmt', ktfmtStyle: 'kotlinlang' });
    expect(setup({ effectivePom: '<name>plain</name>' }).result.options.formatter).toBe('none');
  });

  it('lets kotlin.formatter win and has ktfmt read the editorconfig only when the project is opted in', () => {
    const files = { '.editorconfig': 'root = true\nindent_size = 2\n' };
    const effectivePom = '<artifactId>ktlint-maven-plugin</artifactId>';
    const ignored = setup({ effectivePom, files, policy: { kotlinFormatter: 'ktfmt' } });
    const opted = setup({
      effectivePom,
      files,
      policy: { kotlinFormatter: 'ktfmt', toolPrecedence: { ktfmt: ['project', 'nitpicker'] } },
    });

    expect(ignored.result.options).toMatchObject({ formatter: 'ktfmt', ktfmtEditorconfig: false });
    expect(opted.result.options).toMatchObject({ formatter: 'ktfmt', ktfmtEditorconfig: true });
    expect(opted.result.options.style.editorconfigs.map(({ path: file }) => file)).toContain(
      '.editorconfig',
    );
    expect(opted.result.extraTools.map(({ name }) => name)).toEqual([
      'kotlin-compiler',
      'detekt',
      'detekt-stdlib',
      'ktfmt',
    ]);
  });

  it('gives ktlint an isolated workspace with the followed conventions unless the project is opted in', () => {
    const { result } = setup({
      effectivePom: '<artifactId>ktlint-maven-plugin</artifactId>',
      files: { '.editorconfig': 'root = true\nindent_size = 8\n' },
      policy: { conventions: { 'kotlin.indentation': 4 } },
    });

    expect(result.options.style.editorconfigs).toEqual([
      { path: '.editorconfig', text: 'root = true\n' },
    ]);
    expect(result.options.style.ktlintDefaults).toContain('indent_size = 4');
  });

  it('layers the project detekt config when the project is opted in and merges its forbidden calls into a lists file outside the project', () => {
    const { result, projectRoot, work } = setup({
      files: {
        'config/detekt/detekt.yml':
          'style:\n  ForbiddenMethodCall:\n    methods:\n      - value: java.lang.Thread.sleep\n        reason: no sleeping\n',
      },
      policy: { toolPrecedence: { detekt: ['project', 'nitpicker'] } },
    });

    expect(result.options.detektLayers).toEqual([
      path.join(projectRoot, 'config/detekt/detekt.yml'),
    ]);
    expect(result.options.detektLists).toBe(path.join(work, 'detekt-lists.yml'));
    expect(readFileSync(result.options.detektLists, 'utf8')).toContain('java.lang.Thread.sleep');
  });

  it('ignores the project detekt config by default', () => {
    const { result } = setup({ files: { 'config/detekt/detekt.yml': 'style: {}\n' } });

    expect(result.options.detektLayers).toEqual([]);
    expect(result.options.detektLists).toBeUndefined();
  });

  it('rejects a configured detekt config that does not exist on head and ignores it on base', () => {
    expect(() =>
      setup({ policy: { kotlinDetektConfig: 'missing.yml', snapshot: 'head' } }),
    ).toThrow(/"kotlin.detektConfig" is missing.yml, which does not exist/u);
    expect(
      setup({ policy: { kotlinDetektConfig: 'missing.yml', snapshot: 'base' } }).result.options
        .detektLayers,
    ).toEqual([]);
  });
});
