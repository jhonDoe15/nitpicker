import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { temporaryTrees } from '../../test-support/temporary-trees.mts';
import { forbiddenMethodsOf as untypedForbiddenMethods } from '../../adapters/kotlin/detekt/detekt-lists.mts';
import { textOf } from '../../../../shared/values/readers.mts';
import { kotlinSetup } from './kotlin-setup.mts';
import type { JavaPolicy } from '../../adapters/typed/java-values.mts';
import type { KotlinOptions, ProjectModule } from '../typed/kotlin-types.mts';

import { pinnedKotlinTools as readPinnedTools } from '../typed/kotlin-setup-views.mts';

type SetupResult = ReturnType<typeof kotlinSetup>;

const forbiddenMethodsOf: (text: string) => unknown[] = untypedForbiddenMethods;

const trees = temporaryTrees('nitpicker-kotlin-options-');
const pinned = readPinnedTools();
const NITPICKER_DETEKT = path.resolve(import.meta.dirname, '../../detekt/nitpicker-detekt.yml');
const KTLINT_POM = pluginPom(
  '<groupId>com.github.gantsign.maven</groupId><artifactId>ktlint-maven-plugin</artifactId>',
);
const KTFMT_POM = pluginPom(
  `<groupId>com.diffplug.spotless</groupId><artifactId>spotless-maven-plugin</artifactId>
   <configuration><kotlin><ktfmt><style>KOTLINLANG</style></ktfmt></kotlin></configuration>`,
);

const formatFacts = ({
  formatter,
  ktfmtStyle,
  ktfmtEditorconfig,
}: KotlinOptions): Pick<KotlinOptions, 'formatter' | 'ktfmtStyle' | 'ktfmtEditorconfig'> => ({
  formatter,
  ktfmtStyle,
  ktfmtEditorconfig,
});

function optionsOf(result: SetupResult): KotlinOptions {
  if (result.options === undefined) {
    throw new Error('The setup has no options');
  }
  return result.options;
}

function moduleOf(withKotlin: boolean): ProjectModule {
  return {
    basedir: '/work',
    buildDirectory: '/work/target',
    outputDirectory: '/work/target/classes',
    testOutputDirectory: '/work/target/test-classes',
    sourceRoots: [],
    testSourceRoots: [],
    kotlin: withKotlin
      ? {
          jdkToolchain: undefined,
          allOpen: { annotations: [], presets: [] },
          sourceRoots: [],
          testSourceRoots: [],
        }
      : undefined,
  };
}

function pluginPom(body: string): string {
  return `<project><build><plugins><plugin>${body}</plugin></plugins></build></project>`;
}

function directory(files: Readonly<Record<string, string>> = {}): string {
  return trees.tree(files);
}

function setup({
  preset = 'kotlin',
  modules = [{ kotlin: {} }],
  effectivePom = '',
  files,
  policy,
}: {
  readonly preset?: string;
  readonly modules?: readonly { readonly kotlin?: object }[];
  readonly effectivePom?: string;
  readonly files?: Readonly<Record<string, string>>;
  readonly policy?: JavaPolicy;
}): { projectRoot: string; work: string; result: SetupResult } {
  const projectRoot = directory(files);
  const work = directory();
  return {
    projectRoot,
    work,
    result: kotlinSetup({
      projectRoot,
      policy: { preset, ...policy },
      modules: modules.map(({ kotlin }) => moduleOf(kotlin !== undefined)),
      effectivePom,
      work,
      pinned,
      maven: undefined,
      environment: {},
      spawn: undefined,
      timeoutMs: undefined,
    }),
  };
}

afterEach(trees.cleanup);

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
    expect(formatFacts(optionsOf(setup({ effectivePom: KTLINT_POM }).result))).toEqual({
      formatter: 'ktlint',
      ktfmtStyle: 'meta',
      ktfmtEditorconfig: false,
    });
    expect(formatFacts(optionsOf(setup({ effectivePom: KTFMT_POM }).result))).toEqual({
      formatter: 'ktfmt',
      ktfmtStyle: 'kotlinlang',
      ktfmtEditorconfig: false,
    });
    expect(optionsOf(setup({ effectivePom: '<name>plain</name>' }).result).formatter).toBe('none');
  });

  it('follows the head facts over the formatter the snapshot POM names', () => {
    const { result } = setup({
      effectivePom: KTLINT_POM,
      policy: {
        kotlinFormatter: 'ktfmt',
        kotlinFacts: { formatter: 'ktfmt', build: 'maven', ktfmtStyle: 'google' },
      },
    });

    expect(formatFacts(optionsOf(result))).toEqual({
      formatter: 'ktfmt',
      ktfmtStyle: 'google',
      ktfmtEditorconfig: false,
    });
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

    expect(formatFacts(optionsOf(ignored.result))).toEqual({
      formatter: 'ktfmt',
      ktfmtStyle: 'meta',
      ktfmtEditorconfig: false,
    });
    expect(formatFacts(optionsOf(opted.result))).toEqual({
      formatter: 'ktfmt',
      ktfmtStyle: 'meta',
      ktfmtEditorconfig: true,
    });
    expect(optionsOf(opted.result).style.editorconfigs).toEqual([
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

    expect(optionsOf(result).style.editorconfigs).toEqual([
      { path: '.editorconfig', text: 'root = true\n' },
    ]);
    expect(optionsOf(result).style.ktlintDefaults).toBe('[*.{kt,kts}]\nindent_size = 4\n');
  });

  it('layers the project detekt config when the project is opted in and merges its forbidden calls into a lists file outside the project', () => {
    const { result, projectRoot, work } = setup({
      files: {
        'config/detekt/detekt.yml':
          'style:\n  ForbiddenMethodCall:\n    methods:\n      - value: java.lang.Runtime.halt\n        reason: no halting\n',
      },
      policy: { toolPrecedence: { detekt: ['project', 'nitpicker'] } },
    });

    expect(optionsOf(result).detektLayers).toEqual([
      path.join(projectRoot, 'config/detekt/detekt.yml'),
    ]);
    expect(optionsOf(result).detektLists).toBe(path.join(work, 'detekt-lists.yml'));
    expect(forbiddenMethodsOf(readFileSync(textOf(optionsOf(result).detektLists), 'utf8'))).toEqual(
      [
        ...forbiddenMethodsOf(readFileSync(NITPICKER_DETEKT, 'utf8')),
        { value: 'java.lang.Runtime.halt', reason: 'no halting' },
      ],
    );
  });

  it('lays the followed conventions over the project detekt config again when the project is listed and the conventions are pinned', () => {
    const { result, projectRoot, work } = setup({
      files: { 'config/detekt/detekt.yml': 'style:\n  MaxLineLength:\n    maxLineLength: 140\n' },
      policy: {
        conventions: { 'kotlin.lineLength': 100, 'kotlin.wildcardImports': 'explicit' },
        toolPrecedence: { detekt: ['project', 'nitpicker'] },
      },
    });

    expect(optionsOf(result).detektLayers).toEqual([
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

    expect(optionsOf(result).ktfmtMaxWidth).toBe(100);
  });

  it('ignores the project detekt config by default', () => {
    const { result } = setup({ files: { 'config/detekt/detekt.yml': 'style: {}\n' } });

    expect(optionsOf(result).detektLayers).toEqual([]);
    expect(optionsOf(result).detektLists).toBeUndefined();
  });

  it('rejects a configured detekt config that does not exist on head and ignores it on base', () => {
    expect(() =>
      setup({ policy: { kotlinDetektConfig: 'missing.yml', snapshot: 'head' } }),
    ).toThrow(/"kotlin.detektConfig" is missing.yml, which does not exist/u);
    expect(
      optionsOf(setup({ policy: { kotlinDetektConfig: 'missing.yml', snapshot: 'base' } }).result)
        .detektLayers,
    ).toEqual([]);
  });
});
