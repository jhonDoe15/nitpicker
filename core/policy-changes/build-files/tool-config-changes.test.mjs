import { describe, expect, it } from 'vitest';
import { between, changesOf, without } from './test-support/policy-fixtures.mjs';

const PROJECT = { precedence: ['project', 'nitpicker'] };

describe('project tool configs the project opted into', () => {
  const java = { preset: 'java', tools: { pmd: PROJECT, checkstyle: PROJECT } };
  const files = (ruleset, checkstyle = '<module/>') => ({
    'config/pmd/ruleset.xml': ruleset,
    'config/checkstyle/checkstyle.xml': checkstyle,
    'config/checkstyle/suppressions.xml': '<suppressions/>',
    'src/main/java/A.java': 'class A {}\n',
  });

  it('counts an edit of any file in the PMD or Checkstyle config folder as loosening', () => {
    const base = files('<ruleset a="1"/>');
    const head = {
      ...files('<ruleset a="2"/>'),
      'config/checkstyle/suppressions.xml': '<suppressions a="1"/>',
    };

    expect(between({ base, head, config: java }).policyLoosenings).toEqual([
      'pmd project config changed: config/pmd/ruleset.xml',
      'checkstyle project config changed: config/checkstyle/suppressions.xml',
    ]);
  });

  it('stays quiet for an unchanged config, a tool the project did not opt into and a removed file', () => {
    const base = files('<ruleset/>');
    const removed = without(files('<ruleset/>'), 'config/pmd/ruleset.xml');

    expect(between({ base, head: files('<ruleset/>'), config: java }).policyLoosenings).toEqual([]);
    expect(
      between({ base, head: files('<ruleset a="2"/>'), config: { preset: 'java' } })
        .policyLoosenings,
    ).toEqual([]);
    expect(changesOf(between({ base, head: removed, config: java }))).toEqual({
      policyLoosenings: [],
      policyChanges: ['pmd project config removed: config/pmd/ruleset.xml'],
    });
  });

  it('counts an edit of the detekt config and editorconfig the Kotlin project opted into', () => {
    const kotlin = { preset: 'kotlin', tools: { detekt: PROJECT, ktlint: PROJECT } };
    const at = (detekt, editorconfig) => ({
      'config/detekt/detekt.yml': detekt,
      '.editorconfig': editorconfig,
      'src/main/kotlin/A.kt': 'class A\n',
    });

    expect(
      between({ base: at('a: 1\n', 'x=1\n'), head: at('a: 2\n', 'x=2\n'), config: kotlin })
        .policyLoosenings,
    ).toEqual([
      'detekt project config changed: config/detekt/detekt.yml',
      'ktlint project config changed: .editorconfig',
    ]);
    expect(
      between({ base: at('a: 1\n', 'x=1\n'), head: at('a: 1\n', 'x=1\n'), config: kotlin })
        .policyLoosenings,
    ).toEqual([]);
  });

  it('ignores the project detekt config while the project did not opt into it', () => {
    const at = (text) => ({
      'config/detekt/detekt.yml': text,
      'src/main/kotlin/A.kt': 'class A\n',
    });

    expect(
      between({ base: at('a: 1\n'), head: at('a: 2\n'), config: { preset: 'kotlin' } })
        .policyLoosenings,
    ).toEqual([]);
  });

  it('counts an edit of the Prettier config the project opted into, and only its own key in package.json', () => {
    const typescript = { tools: { prettier: PROJECT } };
    const at = (prettierrc, packageJson) => ({
      '.prettierrc': prettierrc,
      'package.json': JSON.stringify(packageJson),
      'src/a.ts': 'export const a = 1;\n',
    });
    const base = at('{"semi":true}', { name: 'x', version: '1.0.0' });

    expect(
      between({
        base,
        head: at('{"semi":false}', { name: 'x', version: '1.0.0' }),
        config: typescript,
      }).policyLoosenings,
    ).toEqual(['prettier project config changed: .prettierrc']);
    expect(
      between({
        base,
        head: at('{"semi":true}', { name: 'x', version: '2.0.0' }),
        config: typescript,
      }).policyLoosenings,
    ).toEqual([]);
    expect(
      between({
        base,
        head: at('{"semi":true}', { name: 'x', version: '1.0.0', prettier: { semi: false } }),
        config: typescript,
      }).policyLoosenings,
    ).toEqual(['prettier project config changed: package.json']);
  });

  it.each([undefined, 'javascript'])(
    'counts an edit of the knip config a %s project opted into, and only its key in package.json',
    (preset) => {
      const config = { ...(preset === undefined ? {} : { preset }), tools: { knip: PROJECT } };
      const at = (files) => ({ 'src/a.ts': 'export const a = 1;\n', ...files });
      const manifest = (extra) => JSON.stringify({ name: 'x', ...extra });
      const base = at({
        'knip.ts': 'export default { ignore: [] };\n',
        'package.json': manifest(),
      });

      expect(
        between({
          base,
          head: at({
            'knip.ts': "export default { ignore: ['src/**'] };\n",
            'package.json': manifest({ version: '2.0.0' }),
          }),
          config,
        }).policyLoosenings,
      ).toEqual(['knip project config changed: knip.ts']);
      expect(
        between({
          base,
          head: at({ ...base, 'package.json': manifest({ knip: { ignore: ['src/**'] } }) }),
          config,
        }).policyLoosenings,
      ).toEqual(['knip project config changed: package.json']);
      expect(
        between({
          base,
          head: at({ ...base, 'knip.json': '{"ignore":["src/**"]}' }),
          config: { tools: {} },
        }).policyLoosenings,
      ).toEqual([]);
    },
  );

  it.each([undefined, 'javascript'])(
    'counts an edit of the dependency-cruiser config a %s project opted into',
    (preset) => {
      const tools = { 'dependency-cruiser': PROJECT };
      const config = { ...(preset === undefined ? {} : { preset }), tools };
      const at = (rules) => ({
        'src/a.ts': 'export const a = 1;\n',
        '.dependency-cruiser.cjs': `// house rules\nmodule.exports = ${rules};\n`,
      });
      expect(
        between({ base: at('{}'), head: at('{ options: {} }'), config }).policyLoosenings,
      ).toEqual(['dependency-cruiser project config changed: .dependency-cruiser.cjs']);
      expect(between({ base: at('{}'), head: at('{}'), config }).policyLoosenings).toEqual([]);
    },
  );

  it('shows the knip config a change opts into in the same change', () => {
    const files = { 'knip.json': '{"ignore":["src/**"]}', 'src/a.ts': 'export const a = 1;\n' };
    expect(
      between({
        base: files,
        head: files,
        baseConfig: { preset: 'typescript' },
        config: { preset: 'typescript', tools: { knip: PROJECT } },
      }).policyLoosenings,
    ).toEqual([
      'knip project config changed: knip.json',
      'tools.knip.precedence: not set -> ["project","nitpicker"]',
    ]);
  });
});

describe('what counts as an edit of a project tool config', () => {
  const java = { preset: 'java', tools: { checkstyle: PROJECT } };
  const checkstyle = (rules, extra = {}) => ({
    'config/checkstyle/checkstyle.xml': rules,
    'src/main/java/A.java': 'class A {}\n',
    ...extra,
  });
  const RULES = '<module name="Checker">\n  <module name="LineLength"/>\n</module>\n';

  it('reads only the XML rule files of the Checkstyle folder, without comments or layout', () => {
    const notes = { 'config/checkstyle/README.md': 'notes\n' };
    const reformatted =
      '<!-- house rules -->\n<module name="Checker">\n\n    <module   name="LineLength"/>\n</module>';

    expect(
      between({
        base: checkstyle(RULES, notes),
        head: checkstyle(RULES, { 'config/checkstyle/README.md': 'more notes\n' }),
        config: java,
      }).policyLoosenings,
    ).toEqual([]);
    expect(
      between({ base: checkstyle(RULES), head: checkstyle(reformatted), config: java })
        .policyLoosenings,
    ).toEqual([]);
    expect(
      between({
        base: checkstyle(RULES),
        head: checkstyle('<module name="Checker"/>\n'),
        config: java,
      }).policyLoosenings,
    ).toEqual(['checkstyle project config changed: config/checkstyle/checkstyle.xml']);
  });

  it('reads only the editorconfig sections that apply to Kotlin files, and detekt rules without comments', () => {
    const kotlin = { preset: 'kotlin', tools: { detekt: PROJECT, ktlint: PROJECT } };
    const at = (editorconfig, detekt = 'style:\n  MaxLineLength:\n    active: true\n') => ({
      '.editorconfig': editorconfig,
      'config/detekt/detekt.yml': detekt,
      'src/main/kotlin/A.kt': 'class A\n',
    });
    const base = at('root = true\n\n[*.{kt,kts}]\nktlint_code_style = ktlint_official\n');
    const commented = at(
      'root=true\n# style\n[*.{kt,kts}]\nktlint_code_style = ktlint_official\n\n[*.md]\ntrim_trailing_whitespace = false\n',
      '# rules\nstyle:\n  MaxLineLength:\n\n    active: true\n',
    );

    expect(between({ base, head: commented, config: kotlin }).policyLoosenings).toEqual([]);
    expect(
      between({
        base,
        head: at('root = true\n\n[*.kt]\nktlint_code_style = intellij_idea\n'),
        config: kotlin,
      }).policyLoosenings,
    ).toEqual(['ktlint project config changed: .editorconfig']);
  });

  it('reads only the editorconfig sections Prettier formats and ignores layout in its config', () => {
    const typescript = { tools: { prettier: PROJECT } };
    const at = (editorconfig, prettierrc = '{"semi": true}\n') => ({
      '.editorconfig': editorconfig,
      '.prettierrc': prettierrc,
      'src/a.ts': 'export const a = 1;\n',
    });
    const base = at('[*]\nindent_size = 2\n');

    expect(
      between({
        base,
        head: at('[*]\nindent_size = 2\n\n[*.py]\nindent_size = 4\n', '{\n  "semi": true\n}'),
        config: typescript,
      }).policyLoosenings,
    ).toEqual([]);
    expect(
      between({
        base,
        head: at('[*]\nindent_size = 2\n\n[*.ts]\nindent_size = 8\n'),
        config: typescript,
      }).policyLoosenings,
    ).toEqual(['prettier project config changed: .editorconfig']);
  });
});
