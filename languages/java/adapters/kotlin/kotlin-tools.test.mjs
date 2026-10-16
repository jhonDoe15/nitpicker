import { afterEach, describe, expect, it } from 'vitest';
import { resolveKotlinTools } from './kotlin-tools.mjs';
import { project, removeKotlinProjects } from './test-support/kotlin-project.mjs';

afterEach(removeKotlinProjects);

const PROJECT_KTFMT = { ktfmt: ['project', 'nitpicker'] };
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

  it('ignores the style the build names unless the project is listed', () => {
    const files = { 'build.gradle.kts': 'ktfmt { googleStyle() }' };

    expect(toolsOf(files).ktfmtStyle).toBe('meta');
    expect(toolsOf(files, { conventions: { 'kotlin.indentation': '4' } }).ktfmtStyle).toBe(
      'kotlinlang',
    );
  });

  it.each([
    ['kotlinLangStyle()', 'kotlinlang'],
    ['googleStyle()', 'google'],
    ['ktfmt()', 'meta'],
  ])('reads the ktfmt style from %s once the project is listed', (build, style) => {
    expect(
      toolsOf({ 'build.gradle.kts': build }, { toolPrecedence: PROJECT_KTFMT }).ktfmtStyle,
    ).toBe(style);
  });

  it.each([
    ['names no style', 'ktfmt()', '4', 'kotlinlang'],
    ['names no style', 'ktfmt()', '2', 'meta'],
    ['names no style', 'ktfmt()', undefined, 'meta'],
    ['names google', 'ktfmt { googleStyle() }', '4', 'google'],
    ['names meta', 'ktfmt { metaStyle() }', '4', 'meta'],
    ['names kotlinlang', 'ktfmt { kotlinLangStyle() }', '2', 'kotlinlang'],
  ])(
    'with a listed project and a build that %s and the indentation %s followed, uses ktfmt %s',
    (_n, build, width, style) => {
      const conventions = width === undefined ? {} : { 'kotlin.indentation': width };

      expect(
        toolsOf({ 'build.gradle.kts': build }, { conventions, toolPrecedence: PROJECT_KTFMT })
          .ktfmtStyle,
      ).toBe(style);
    },
  );

  it('lets the conventions win over the build when nitpicker is listed first', () => {
    const options = { toolPrecedence: { ktfmt: ['nitpicker', 'project'] } };
    const files = { 'build.gradle.kts': 'ktfmt { googleStyle() }' };

    expect(
      toolsOf(files, { ...options, conventions: { 'kotlin.indentation': '4' } }).ktfmtStyle,
    ).toBe('kotlinlang');
    expect(toolsOf(files, options).ktfmtStyle).toBe('google');
  });

  it('reads the build of the policy root, which is the head checkout', () => {
    const base = project({ 'build.gradle.kts': 'ktfmt()' });
    const head = project({ 'build.gradle.kts': 'ktfmt { googleStyle() }' });

    expect(
      resolveKotlinTools(base, { policyRoot: head, toolPrecedence: PROJECT_KTFMT }).ktfmtStyle,
    ).toBe('google');
  });
});

describe('detekt config', () => {
  const listed = { toolPrecedence: { detekt: ['project', 'nitpicker'] } };

  it.each(['config/detekt/detekt.yml', 'config/detekt.yml', 'detekt.yml', 'detekt.yaml'])(
    'finds %s once the project is listed',
    (file) => {
      expect(toolsOf({ [file]: 'build:\n' }, listed).detektConfig).toBe(file);
    },
  );

  it('leaves the project file out unless it is listed', () => {
    expect(toolsOf({ 'detekt.yml': '' }).detektConfig).toBeUndefined();
    expect(
      toolsOf({ 'detekt.yml': '' }, { toolPrecedence: { detekt: ['nitpicker'] } }),
    ).toMatchObject({ detektConfig: undefined });
  });

  it('prefers the more specific location and asks for a file when the project is listed', () => {
    expect(toolsOf({ 'detekt.yml': '', 'config/detekt/detekt.yml': '' }, listed).detektConfig).toBe(
      'config/detekt/detekt.yml',
    );
    expect(() => toolsOf({}, listed)).toThrow(
      '"tools.detekt.precedence" lists "project" but its config (config/detekt/detekt.yml) is missing',
    );
  });

  it('names the project file it leaves out so a finding can point to the opt-in', () => {
    expect(toolsOf({ 'config/detekt.yml': '' }).detektIgnored).toBe('config/detekt.yml');
    expect(toolsOf({}).detektIgnored).toBeUndefined();
    expect(toolsOf({ 'detekt.yml': '' }, listed).detektIgnored).toBeUndefined();
  });

  it('uses the configured path, which also names the project file without a listing', () => {
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

describe('ktlint and ktfmt with a project .editorconfig', () => {
  it('reads the .editorconfig only for a listed project', () => {
    const files = { 'build.gradle.kts': 'ktlint', '.editorconfig': 'indent_size = 8\n' };

    expect(toolsOf(files).projectEditorconfig).toBeUndefined();
    expect(toolsOf(files, { toolPrecedence: { ktlint: ['project'] } }).projectEditorconfig).toBe(
      'indent_size = 8\n',
    );
  });

  it('fails when ktlint lists the project and there is no .editorconfig', () => {
    expect(() =>
      toolsOf({ 'build.gradle.kts': 'ktlint' }, { toolPrecedence: { ktlint: ['project'] } }),
    ).toThrow('"tools.ktlint.precedence" lists "project" but .editorconfig is missing');
  });

  it('turns ktfmt editorconfig support on only for a listed project', () => {
    const files = { 'build.gradle.kts': 'ktfmt()', '.editorconfig': '' };

    expect(toolsOf(files).ktfmtEditorconfig).toBe(false);
    expect(toolsOf(files, { toolPrecedence: PROJECT_KTFMT }).ktfmtEditorconfig).toBe(true);
  });
});
