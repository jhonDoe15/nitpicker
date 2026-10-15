import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';
import { kotlinGradleArguments, resolveKotlinTools } from './kotlin-tools.mjs';
import { fileURLToPath } from 'node:url';

const fakeGradle = path.join(
  fileURLToPath(new URL('../', import.meta.url)),
  'fixtures/fake-gradle.mjs',
);
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files = {}) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-tools-')));
  temporaryRoots.push(root);
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), contents);
  }
  return root;
}

const toolsOf = (files, options) => resolveKotlinTools(project(files), options);
const formatterOf = (files, options) => toolsOf(files, options).formatter;

describe('formatter detection', () => {
  it.each([
    ['ktlint in the build files', { 'build.gradle.kts': 'id("org.jlleitschuh.gradle.ktlint")' }],
    ['ktlint in the version catalog', { 'gradle/libs.versions.toml': 'ktlint = "1.8.0"' }],
    ['ktlint_ keys in .editorconfig', { '.editorconfig': 'ktlint_code_style = ktlint_official' }],
    [
      'both tools named',
      { 'build.gradle.kts': 'id("com.ncorti.ktfmt.gradle")\nid("org.jlleitschuh.gradle.ktlint")' },
    ],
  ])('detects ktlint from %s', (_name, files) => {
    expect(formatterOf(files)).toBe('ktlint');
  });

  it('trusts the build files over ktlint_ keys left in .editorconfig', () => {
    const files = { 'build.gradle.kts': 'ktfmt()', '.editorconfig': 'ktlint_code_style = x' };

    expect(formatterOf(files)).toBe('ktfmt');
  });

  it('detects ktfmt from the plugin or Spotless', () => {
    expect(formatterOf({ 'build.gradle.kts': 'id("com.ncorti.ktfmt.gradle")' })).toBe('ktfmt');
    expect(formatterOf({ 'build.gradle': 'spotless { kotlin { ktfmt() } }' })).toBe('ktfmt');
  });

  it('prefers the tool in the Spotless kotlin block over the one in kotlinGradle', () => {
    const build = 'spotless { kotlin { ktfmt() } kotlinGradle { target("*.kts"); ktlint() } }';

    expect(formatterOf({ 'build.gradle.kts': build })).toBe('ktfmt');
    expect(formatterOf({ 'build.gradle.kts': 'spotless { kotlinGradle { ktlint() } }' })).toBe(
      'none',
    );
  });

  it('ignores a tool named in a comment', () => {
    const build =
      '// we moved from ktlint to ktfmt\n/* ktlint */\nplugins { id("com.ncorti.ktfmt.gradle") }';

    expect(formatterOf({ 'build.gradle.kts': build })).toBe('ktfmt');
  });

  it('runs no format check for a project that names no formatter', () => {
    expect(formatterOf({ 'build.gradle.kts': 'plugins { kotlin("jvm") }' })).toBe('none');
    expect(formatterOf({ '.editorconfig': 'indent_size = 2' })).toBe('none');
    expect(formatterOf({})).toBe('none');
  });

  it('lets the configured formatter win, including none', () => {
    const files = { 'build.gradle.kts': 'ktlint' };

    expect(formatterOf(files, { formatter: 'ktfmt' })).toBe('ktfmt');
    expect(formatterOf(files, { formatter: 'none' })).toBe('none');
  });

  it.each([
    ['kotlinLangStyle()', 'kotlinlang'],
    ['googleStyle()', 'google'],
    ['ktfmt()', 'meta'],
  ])('reads the ktfmt style from %s', (build, style) => {
    expect(toolsOf({ 'build.gradle.kts': build }).ktfmtStyle).toBe(style);
  });
});

describe('detekt config', () => {
  it.each(['config/detekt/detekt.yml', 'config/detekt.yml', 'detekt.yml', 'detekt.yaml'])(
    'finds %s',
    (file) => {
      expect(toolsOf({ [file]: 'build:\n' }).detektConfig).toBe(file);
    },
  );

  it('prefers the more specific location and finds nothing without a file', () => {
    expect(toolsOf({ 'detekt.yml': '', 'config/detekt/detekt.yml': '' }).detektConfig).toBe(
      'config/detekt/detekt.yml',
    );
    expect(toolsOf({}).detektConfig).toBeUndefined();
  });

  it('uses the configured path over a detected file', () => {
    const files = { 'detekt.yml': '', 'tools/rules.yml': '' };

    expect(toolsOf(files, { detektConfig: 'tools/rules.yml' }).detektConfig).toBe(
      'tools/rules.yml',
    );
  });

  it('fails for a configured file that is missing on head but not on base', () => {
    const root = project({ 'detekt.yml': '' });

    expect(() =>
      resolveKotlinTools(root, { detektConfig: 'tools/rules.yml', snapshot: 'head' }),
    ).toThrow('"kotlin.detektConfig" is tools/rules.yml, which does not exist');
    expect(
      resolveKotlinTools(root, { detektConfig: 'tools/rules.yml', snapshot: 'base' }).detektConfig,
    ).toBeUndefined();
  });
});

describe('Gradle arguments', () => {
  it('passes what was resolved as project properties', () => {
    const root = project({
      'build.gradle.kts': 'ktfmt { googleStyle() }',
      '.editorconfig': '',
      'config/detekt.yml': '',
    });

    expect(kotlinGradleArguments(root, {})).toEqual([
      '-Pnitpicker.kotlin=true',
      '-Pnitpicker.kotlin.formatter=ktfmt',
      '-Pnitpicker.kotlin.ktfmtStyle=google',
      '-Pnitpicker.kotlin.editorconfig=true',
      `-Pnitpicker.kotlin.detektConfig=${path.join(root, 'config/detekt.yml')}`,
    ]);
  });

  it('runs Gradle without the configuration cache, for both presets', () => {
    const root = project({ 'build.gradle.kts': 'ktlint' });
    const argumentsOf = (policy) => {
      collectJavaFindings(root, { gradle: fakeGradle, policy });
      return JSON.parse(readFileSync(path.join(root, 'build/nitpicker/gradle-args.json'), 'utf8'));
    };
    const common = ['--console=plain', '--quiet', '--no-configuration-cache'];

    expect(argumentsOf({ preset: 'kotlin' })).toEqual([
      ...common,
      '-Pnitpicker.kotlin=true',
      '-Pnitpicker.kotlin.formatter=ktlint',
      '-Pnitpicker.kotlin.ktfmtStyle=meta',
      '-I',
      INIT_SCRIPT,
      'nitpickerJava',
    ]);
    expect(argumentsOf({ preset: 'java' })).toEqual([
      ...common,
      '-I',
      INIT_SCRIPT,
      'nitpickerJava',
    ]);
  });
});
