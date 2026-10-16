import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';
import { collectJavaFindings } from '../java-diff.mjs';
import { kotlinGradleArguments } from './kotlin-tools.mjs';
import { kotlinProjects } from './test-support/kotlin-project.mjs';

const fakeGradle = path.join(
  fileURLToPath(new URL('../', import.meta.url)),
  'fixtures/fake-gradle.mjs',
);
const FOLLOWED = {
  'kotlin.indentation': '4',
  'kotlin.trailingCommas': 'never',
  'kotlin.wildcardImports': 'wildcard',
};
const ISOLATED_EDITORCONFIG = encodeURIComponent('root = true\n');

const { project, remove } = kotlinProjects();

afterEach(remove);

function decoded(args) {
  return args.map((argument) => decodeURIComponent(argument));
}

describe('what runs without the project', () => {
  it('passes the isolated defaults for ktfmt: no build style, no editorconfig, no detekt file', () => {
    const root = project({
      'build.gradle.kts': 'ktfmt { googleStyle() }',
      '.editorconfig': 'indent_size = 8\n',
      'config/detekt.yml': '',
    });

    expect(kotlinGradleArguments(root, {})).toEqual([
      '-Pnitpicker.kotlin=true',
      '-Pnitpicker.kotlin.formatter=ktfmt',
      '-Pnitpicker.kotlin.ktfmtStyle=meta',
      `-Pnitpicker.kotlin.workspaceEditorconfig=${ISOLATED_EDITORCONFIG}`,
    ]);
  });

  it('passes the conventions followed as ktlint defaults, a ktfmt style and a detekt layer', () => {
    const root = project({ 'build.gradle.kts': 'ktlint', '.editorconfig': 'indent_size = 8\n' });

    expect(decoded(kotlinGradleArguments(root, { conventions: FOLLOWED }))).toEqual([
      '-Pnitpicker.kotlin=true',
      '-Pnitpicker.kotlin.formatter=ktlint',
      '-Pnitpicker.kotlin.ktfmtStyle=kotlinlang',
      '-Pnitpicker.kotlin.workspaceEditorconfig=root = true\n',
      '-Pnitpicker.kotlin.ktlintDefaults=' +
        [
          '[*.{kt,kts}]',
          'indent_size = 4',
          'ij_kotlin_allow_trailing_comma = false',
          'ij_kotlin_allow_trailing_comma_on_call_site = false',
          'ktlint_standard_no-wildcard-imports = disabled',
          '',
        ].join('\n'),
      '-Pnitpicker.kotlin.detektLayers=conventions',
      '-Pnitpicker.kotlin.detektConventions=style:\n  WildcardImport:\n    active: false\n',
    ]);
  });

  it('passes no defaults for the conventions that match what the tools do already', () => {
    const root = project({ 'build.gradle.kts': 'ktlint' });
    const conventions = { 'kotlin.trailingCommas': 'always', 'kotlin.wildcardImports': 'explicit' };

    expect(kotlinGradleArguments(root, { conventions })).toEqual([
      '-Pnitpicker.kotlin=true',
      '-Pnitpicker.kotlin.formatter=ktlint',
      '-Pnitpicker.kotlin.ktfmtStyle=meta',
      `-Pnitpicker.kotlin.workspaceEditorconfig=${ISOLATED_EDITORCONFIG}`,
    ]);
  });

  it('copies no sources for a project without a formatter', () => {
    expect(kotlinGradleArguments(project({}), {})).toEqual([
      '-Pnitpicker.kotlin=true',
      '-Pnitpicker.kotlin.formatter=none',
      '-Pnitpicker.kotlin.ktfmtStyle=meta',
    ]);
  });
});

describe('what runs with the project listed', () => {
  it('puts the .editorconfig of the head checkout into the ktlint workspace', () => {
    const base = project({ 'build.gradle.kts': 'ktlint', '.editorconfig': 'indent_size = 2\n' });
    const head = project({ 'build.gradle.kts': 'ktlint', '.editorconfig': 'indent_size = 8\n' });

    const args = decoded(
      kotlinGradleArguments(base, {
        policyRoot: head,
        toolPrecedence: { ktlint: ['project', 'nitpicker'] },
        conventions: { 'kotlin.indentation': '4' },
      }),
    );

    expect(args.slice(3)).toEqual([
      '-Pnitpicker.kotlin.workspaceEditorconfig=root = true\n\nindent_size = 8\n',
      '-Pnitpicker.kotlin.ktlintDefaults=[*.{kt,kts}]\nindent_size = 4\n',
    ]);
  });

  it('turns on ktfmt editorconfig support and the build style, from the head checkout', () => {
    const base = project({ 'build.gradle.kts': 'ktfmt()' });
    const head = project({
      'build.gradle.kts': 'ktfmt { kotlinLangStyle() }',
      '.editorconfig': 'max_line_length = 100\n',
    });

    const args = decoded(
      kotlinGradleArguments(base, {
        policyRoot: head,
        toolPrecedence: { ktfmt: ['project', 'nitpicker'] },
      }),
    );

    expect(args).toEqual([
      '-Pnitpicker.kotlin=true',
      '-Pnitpicker.kotlin.formatter=ktfmt',
      '-Pnitpicker.kotlin.ktfmtStyle=kotlinlang',
      '-Pnitpicker.kotlin.ktfmtEditorconfig=true',
      '-Pnitpicker.kotlin.workspaceEditorconfig=root = true\n\nmax_line_length = 100\n',
    ]);
  });

  it('layers the project detekt file above the conventions and names it by its head path', () => {
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
      '-Pnitpicker.kotlin.detektLayers=conventions,project',
      `-Pnitpicker.kotlin.detektConfig=${path.join(head, 'config/detekt/detekt.yml')}`,
    ]);
    expect(layersOf(['nitpicker', 'project'])).toEqual([
      '-Pnitpicker.kotlin.detektLayers=project,conventions',
      `-Pnitpicker.kotlin.detektConfig=${path.join(head, 'config/detekt/detekt.yml')}`,
    ]);
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
});

describe('the Gradle hand-off', () => {
  const argumentsOf = (root, policy) => {
    collectJavaFindings(root, { gradle: fakeGradle, policy });
    return JSON.parse(readFileSync(path.join(root, 'build/nitpicker/gradle-args.json'), 'utf8'));
  };

  it('hands the conventions of the policy to Gradle', () => {
    const root = project({ 'build.gradle.kts': 'ktlint' });

    const args = argumentsOf(root, {
      preset: 'kotlin',
      conventions: { 'kotlin.indentation': '2' },
    });

    expect(decoded(args).slice(3, 8)).toEqual([
      '-Pnitpicker.kotlin=true',
      '-Pnitpicker.kotlin.formatter=ktlint',
      '-Pnitpicker.kotlin.ktfmtStyle=meta',
      '-Pnitpicker.kotlin.workspaceEditorconfig=root = true\n',
      '-Pnitpicker.kotlin.ktlintDefaults=[*.{kt,kts}]\nindent_size = 2\n',
    ]);
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
