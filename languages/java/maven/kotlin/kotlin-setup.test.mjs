import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readPinnedTools } from '../../builds/java-build.mjs';
import { forbiddenMethodsOf } from '../../adapters/kotlin/detekt/detekt-lists.mjs';
import { kotlinSetup } from './kotlin-setup.mjs';

const roots = [];
const pinned = readPinnedTools();
const NITPICKER_DETEKT = path.resolve(import.meta.dirname, '../../detekt/nitpicker-detekt.yml');
const KTLINT_POM = pomWith('ktlint-maven-plugin');
const KTFMT_POM = pomWith('ktfmt-maven-plugin', '<style>KOTLINLANG</style>');

const formatFacts = ({ formatter, ktfmtStyle, ktfmtEditorconfig }) => ({
  formatter,
  ktfmtStyle,
  ktfmtEditorconfig,
});

function pomWith(artifactId, configuration = '') {
  const body = `<artifactId>${artifactId}</artifactId><configuration>${configuration}</configuration>`;
  return `<project><build><plugins><plugin>${body}</plugin></plugins></build></project>`;
}

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
    expect(formatFacts(setup({ effectivePom: KTLINT_POM }).result.options)).toEqual({
      formatter: 'ktlint',
      ktfmtStyle: 'meta',
      ktfmtEditorconfig: false,
    });
    expect(formatFacts(setup({ effectivePom: KTFMT_POM }).result.options)).toEqual({
      formatter: 'ktfmt',
      ktfmtStyle: 'kotlinlang',
      ktfmtEditorconfig: false,
    });
    expect(setup({ effectivePom: '<name>plain</name>' }).result.options.formatter).toBe('none');
  });

  it('lets kotlin.formatter win and has ktfmt read the editorconfig only when the project is opted in', () => {
    const files = { '.editorconfig': 'root = true\nindent_size = 2\n' };
    const effectivePom = KTLINT_POM;
    const ignored = setup({ effectivePom, files, policy: { kotlinFormatter: 'ktfmt' } });
    const opted = setup({
      effectivePom,
      files,
      policy: { kotlinFormatter: 'ktfmt', toolPrecedence: { ktfmt: ['project', 'nitpicker'] } },
    });

    expect(formatFacts(ignored.result.options)).toEqual({
      formatter: 'ktfmt',
      ktfmtStyle: 'meta',
      ktfmtEditorconfig: false,
    });
    expect(formatFacts(opted.result.options)).toEqual({
      formatter: 'ktfmt',
      ktfmtStyle: 'meta',
      ktfmtEditorconfig: true,
    });
    expect(opted.result.options.style.editorconfigs).toEqual([
      { path: '.editorconfig', text: 'root = true\n\nroot = true\nindent_size = 2\n' },
    ]);
    expect(opted.result.extraTools.map(({ name }) => name)).toEqual([
      'kotlin-compiler',
      'detekt',
      'detekt-stdlib',
      'ktfmt',
    ]);
  });

  it('gives ktlint an isolated workspace with the followed conventions unless the project is opted in', () => {
    const { result } = setup({
      effectivePom: KTLINT_POM,
      files: { '.editorconfig': 'root = true\nindent_size = 8\n' },
      policy: { conventions: { 'kotlin.indentation': 4 } },
    });

    expect(result.options.style.editorconfigs).toEqual([
      { path: '.editorconfig', text: 'root = true\n' },
    ]);
    expect(result.options.style.ktlintDefaults).toBe('[*.{kt,kts}]\nindent_size = 4\n');
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
    expect(forbiddenMethodsOf(readFileSync(result.options.detektLists, 'utf8'))).toEqual([
      ...forbiddenMethodsOf(readFileSync(NITPICKER_DETEKT, 'utf8')),
      { value: 'java.lang.Thread.sleep', reason: 'no sleeping' },
    ]);
  });

  it('lays the followed conventions over the project detekt config again when the project is listed and the conventions are pinned', () => {
    const { result, projectRoot, work } = setup({
      files: { 'config/detekt/detekt.yml': 'style:\n  MaxLineLength:\n    maxLineLength: 140\n' },
      policy: {
        conventions: { 'kotlin.lineLength': 100, 'kotlin.wildcardImports': 'explicit' },
        toolPrecedence: { detekt: ['project', 'nitpicker'] },
      },
    });

    expect(result.options.detektLayers).toEqual([
      path.join(work, 'followed-conventions.yml'),
      path.join(projectRoot, 'config/detekt/detekt.yml'),
      path.join(work, 'enforced-conventions.yml'),
    ]);
    expect(readFileSync(path.join(work, 'enforced-conventions.yml'), 'utf8')).toBe(
      'style:\n  WildcardImport:\n    active: true\n  MaxLineLength:\n    maxLineLength: 100\n',
    );
  });

  it('hands ktfmt the line length it follows', () => {
    const { result } = setup({
      effectivePom: KTFMT_POM,
      policy: { conventions: { 'kotlin.lineLength': 100 } },
    });

    expect(result.options.ktfmtMaxWidth).toBe(100);
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
