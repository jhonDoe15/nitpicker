import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../../builds/java-build.mjs';
import { collectJavaFindings } from '../../java-diff.mjs';
import { kotlinGradleArguments, kotlinStyleFile, resolveKotlinTools } from '../kotlin-tools.mjs';
import { fakeGradleRun } from '../../test-support/in-process-gradle.mjs';
import { kotlinProjects } from '../test-support/kotlin-project.mjs';

const FOLLOWED = {
  'kotlin.indentation': '4',
  'kotlin.trailingCommas': 'never',
  'kotlin.wildcardImports': 'wildcard',
};
const ISOLATED = { offset: '', editorconfigs: [{ path: '.editorconfig', text: 'root = true\n' }] };

const { project, remove } = kotlinProjects();

afterEach(remove);

const styleOf = (root, options = {}) =>
  kotlinStyleFile(resolveKotlinTools(root, options), options.conventions ?? {});

describe('what runs without the project', () => {
  it('passes the declared ktfmt style for ktfmt, but no editorconfig, no mirror and no detekt file', () => {
    const root = project({
      'build.gradle.kts': 'ktfmt { googleStyle() }',
      '.editorconfig': 'indent_size = 8\n',
      'config/detekt.yml': '',
    });

    expect(kotlinGradleArguments(root, {})).toEqual([
      '-Pnitpicker.kotlin=true',
      '-Pnitpicker.kotlin.formatter=ktfmt',
      '-Pnitpicker.kotlin.ktfmtStyle=google',
    ]);
    expect(styleOf(root)).toBeUndefined();
  });

  it('puts the conventions followed into the style file: ktlint defaults and a detekt layer', () => {
    const root = project({ 'build.gradle.kts': 'ktlint', '.editorconfig': 'indent_size = 8\n' });
    const options = { conventions: FOLLOWED };

    expect(kotlinGradleArguments(root, { ...options, styleFile: '/tmp/style.json' })).toEqual([
      '-Pnitpicker.kotlin=true',
      '-Pnitpicker.kotlin.formatter=ktlint',
      '-Pnitpicker.kotlin.ktfmtStyle=kotlinlang',
      '-Pnitpicker.kotlin.styleFile=/tmp/style.json',
      '-Pnitpicker.kotlin.detektLayers=conventions',
    ]);
    expect(styleOf(root, options)).toEqual({
      ...ISOLATED,
      ktlintDefaults: [
        '[*.{kt,kts}]',
        'indent_size = 4',
        'ij_kotlin_allow_trailing_comma = false',
        'ij_kotlin_allow_trailing_comma_on_call_site = false',
        'ktlint_standard_no-wildcard-imports = disabled',
        '',
      ].join('\n'),
      detektConventions: 'style:\n  WildcardImport:\n    active: false\n',
    });
  });

  it('passes no defaults for the conventions that match what the tools do already', () => {
    const root = project({ 'build.gradle.kts': 'ktlint' });
    const conventions = { 'kotlin.trailingCommas': 'always', 'kotlin.wildcardImports': 'explicit' };

    expect(styleOf(root, { conventions })).toEqual(ISOLATED);
  });

  it('copies no sources and writes no style file for a project without a formatter', () => {
    expect(kotlinGradleArguments(project({}), {})).toEqual([
      '-Pnitpicker.kotlin=true',
      '-Pnitpicker.kotlin.formatter=none',
      '-Pnitpicker.kotlin.ktfmtStyle=meta',
    ]);
    expect(styleOf(project({}))).toBeUndefined();
  });
});

describe('what runs with the project listed', () => {
  it('puts the .editorconfig files of the head checkout into the ktlint style file, nested ones included, with the followed values last', () => {
    const base = project({ 'build.gradle.kts': 'ktlint', '.editorconfig': 'indent_size = 2\n' });
    const head = project({
      'build.gradle.kts': 'ktlint',
      '.editorconfig': 'indent_size = 8\n',
      'src/main/kotlin/.editorconfig': '[*.kt]\nindent_size = 2\n',
    });

    const style = styleOf(base, {
      policyRoot: head,
      toolPrecedence: { ktlint: ['project', 'nitpicker'] },
      conventions: { 'kotlin.indentation': '4' },
    });

    expect(style).toEqual({
      offset: '',
      editorconfigs: [
        { path: '.editorconfig', text: 'root = true\n\nindent_size = 8\n' },
        {
          path: 'src/main/kotlin/.editorconfig',
          text: '[*.kt]\nindent_size = 2\n\n[*.{kt,kts}]\nindent_size = 4\n',
        },
      ],
      ktlintDefaults: '[*.{kt,kts}]\nindent_size = 4\n',
    });
  });

  it('lets the followed limits win over the head .editorconfig, so an edited width is not enforced', () => {
    const base = project({ 'build.gradle.kts': 'ktlint' });
    const head = project({
      'build.gradle.kts': 'ktlint',
      '.editorconfig': '[*.{kt,kts}]\nindent_size = 8\nmax_line_length = 160\n',
    });

    const style = styleOf(base, {
      policyRoot: head,
      toolPrecedence: { ktlint: ['project', 'nitpicker'] },
      conventions: { 'kotlin.indentation': '8', 'kotlin.lineLength': '100' },
    });

    expect(style).toEqual({
      offset: '',
      editorconfigs: [
        {
          path: '.editorconfig',
          text: 'root = true\n\n[*.{kt,kts}]\nindent_size = 8\nmax_line_length = 160\n\n[*.{kt,kts}]\nmax_line_length = 100\n',
        },
      ],
      ktlintDefaults: '[*.{kt,kts}]\nindent_size = 8\nmax_line_length = 100\n',
      detektConventions: 'style:\n  MaxLineLength:\n    maxLineLength: 100\n',
    });
  });

  it('enforces the followed values over nested and ancestor .editorconfig files too', () => {
    const base = project({ 'build.gradle.kts': 'ktlint' });
    const head = project({
      'build.gradle.kts': 'ktlint',
      '.editorconfig': '[*.kt]\nmax_line_length = 300\n',
      'src/.editorconfig': '[*.kt]\nmax_line_length = 400\nij_kotlin_allow_trailing_comma = true\n',
    });

    const style = styleOf(base, {
      policyRoot: head,
      toolPrecedence: { ktlint: ['project', 'nitpicker'] },
      conventions: { 'kotlin.lineLength': '100', 'kotlin.trailingCommas': 'never' },
    });

    expect(style.editorconfigs.map(({ path: file, text }) => [file, text])).toEqual([
      [
        '.editorconfig',
        'root = true\n\n[*.kt]\nmax_line_length = 300\n\n[*.{kt,kts}]\nmax_line_length = 100\n',
      ],
      [
        'src/.editorconfig',
        '[*.kt]\nmax_line_length = 400\nij_kotlin_allow_trailing_comma = true\n\n[*.{kt,kts}]\nmax_line_length = 100\nij_kotlin_allow_trailing_comma = false\n',
      ],
    ]);
  });

  it('re-asserts every followed detekt rule in a last layer of its own', () => {
    const base = project({ 'build.gradle.kts': 'plugins {}' });
    const head = project({ 'detekt.yml': 'style:\n  WildcardImport:\n    active: false\n' });
    const options = {
      policyRoot: head,
      toolPrecedence: { detekt: ['project', 'nitpicker'] },
      conventions: { 'kotlin.wildcardImports': 'explicit', 'kotlin.lineLength': '100' },
    };

    expect(styleOf(base, options)).toEqual({
      detektConventions: 'style:\n  MaxLineLength:\n    maxLineLength: 100\n',
      detektEnforced:
        'style:\n  WildcardImport:\n    active: true\n  MaxLineLength:\n    maxLineLength: 100\n',
    });
  });

  it('turns on ktfmt editorconfig support, the build style and the mirror, from the head checkout', () => {
    const base = project({ 'build.gradle.kts': 'ktfmt()' });
    const head = project({
      'build.gradle.kts': 'ktfmt { kotlinLangStyle() }',
      '.editorconfig': 'max_line_length = 100\n',
    });
    const options = { policyRoot: head, toolPrecedence: { ktfmt: ['project', 'nitpicker'] } };

    expect(kotlinGradleArguments(base, options)).toEqual([
      '-Pnitpicker.kotlin=true',
      '-Pnitpicker.kotlin.formatter=ktfmt',
      '-Pnitpicker.kotlin.ktfmtStyle=kotlinlang',
      '-Pnitpicker.kotlin.ktfmtEditorconfig=true',
    ]);
    expect(styleOf(base, options).editorconfigs).toEqual([
      { path: '.editorconfig', text: 'root = true\n\nmax_line_length = 100\n' },
    ]);
  });

  it('layers the project detekt file above the conventions, re-applies the followed conventions last and names it by its head path', () => {
    const base = project({ 'build.gradle.kts': 'plugins {}' });
    const head = project({ 'config/detekt/detekt.yml': 'style:\n' });
    const options = {
      policyRoot: head,
      conventions: { 'kotlin.wildcardImports': 'wildcard' },
    };

    const layersOf = (precedence) =>
      kotlinGradleArguments(base, { ...options, toolPrecedence: { detekt: precedence } }).filter(
        (argument) => /detekt(Layers|Config)/.test(argument),
      );

    expect(layersOf(['project', 'nitpicker'])).toEqual([
      '-Pnitpicker.kotlin.detektLayers=conventions,project,enforced',
      `-Pnitpicker.kotlin.detektConfig=${path.join(head, 'config/detekt/detekt.yml')}`,
    ]);
    expect(layersOf(['nitpicker', 'project'])).toEqual([
      '-Pnitpicker.kotlin.detektLayers=project,conventions',
      `-Pnitpicker.kotlin.detektConfig=${path.join(head, 'config/detekt/detekt.yml')}`,
    ]);
  });

  it('makes the detekt conventions win over the project file when nitpicker is first, wildcards allowed or not', () => {
    const root = project({ 'detekt.yml': '' });
    const toolPrecedence = { detekt: ['nitpicker', 'project'] };

    expect(styleOf(root, { toolPrecedence }).detektConventions).toBe(
      'style:\n  WildcardImport:\n    active: true\n',
    );
    expect(styleOf(root, { toolPrecedence, conventions: FOLLOWED }).detektConventions).toBe(
      'style:\n  WildcardImport:\n    active: false\n',
    );
  });

  it('uses the project detekt file alone when no convention needs a layer', () => {
    const root = project({ 'detekt.yml': '' });

    expect(
      kotlinGradleArguments(root, { toolPrecedence: { detekt: ['project'] } }).slice(3),
    ).toEqual([
      '-Pnitpicker.kotlin.detektLayers=project',
      `-Pnitpicker.kotlin.detektConfig=${path.join(root, 'detekt.yml')}`,
    ]);
  });

  it("passes the merged forbidden-call list when the project's detekt config lists calls of its own", () => {
    const root = project({
      'detekt.yml': "style:\n  ForbiddenMethodCall:\n    methods: ['kotlin.io.println']\n",
    });

    expect(
      kotlinGradleArguments(root, { toolPrecedence: { detekt: ['project'] } }).slice(3),
    ).toEqual([
      '-Pnitpicker.kotlin.detektLayers=project',
      `-Pnitpicker.kotlin.detektConfig=${path.join(root, 'detekt.yml')}`,
      `-Pnitpicker.kotlin.detektLists=${path.join(root, 'build/nitpicker/detekt-lists.yml')}`,
    ]);
  });
});

describe('the Gradle hand-off', () => {
  const argumentsOf = (root, policy) => {
    collectJavaFindings(root, { ...fakeGradleRun, policy });
    return JSON.parse(readFileSync(path.join(root, 'build/gradle-args.json'), 'utf8')).filter(
      (argument) => !argument.startsWith('-Pnitpicker.reportDir='),
    );
  };
  const styleFileOf = (root) =>
    JSON.parse(readFileSync(path.join(root, 'build/style-file.json'), 'utf8'));

  it('hands the style of the policy to Gradle in a file, which is gone once the run ends', () => {
    const root = project({ 'build.gradle.kts': 'ktlint' });

    const args = argumentsOf(root, {
      preset: 'kotlin',
      conventions: { 'kotlin.indentation': '2' },
    });

    const file = args.find((argument) => argument.startsWith('-Pnitpicker.kotlin.styleFile='));
    expect(args.slice(3, 6)).toEqual([
      '-Pnitpicker.kotlin=true',
      '-Pnitpicker.kotlin.formatter=ktlint',
      '-Pnitpicker.kotlin.ktfmtStyle=meta',
    ]);
    expect(styleFileOf(root)).toEqual({
      ...ISOLATED,
      ktlintDefaults: '[*.{kt,kts}]\nindent_size = 2\n',
    });
    expect(existsSync(file.slice(file.indexOf('=') + 1))).toBe(false);
  });

  it('runs Gradle without the configuration cache, for both presets', () => {
    const root = project({});
    const common = ['--console=plain', '--quiet', '--no-configuration-cache'];

    expect(argumentsOf(root, { preset: 'kotlin' })).toEqual([
      ...common,
      '-Pnitpicker.kotlin=true',
      '-Pnitpicker.kotlin.formatter=none',
      '-Pnitpicker.kotlin.ktfmtStyle=meta',
      '-I',
      INIT_SCRIPT,
      'nitpickerJava',
    ]);
    expect(argumentsOf(root, { preset: 'java' })).toEqual([
      ...common,
      '-I',
      INIT_SCRIPT,
      'nitpickerJava',
    ]);
  });
});
