import { describe, expect, it } from 'vitest';
import { between, changesOf, without } from '../test-support/policy-fixtures.mjs';

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

  it('counts an edit of the golangci-lint config whose formatter options the Go project opted into', () => {
    const go = { preset: 'go', tools: { gofumpt: PROJECT } };
    const at = (golangci) => ({
      '.golangci.yml': golangci,
      'go.mod': 'module m\n',
      'a.go': 'package a\n',
    });

    expect(
      between({ base: at('extra: 1\n'), head: at('extra: 2\n'), config: go }).policyLoosenings,
    ).toEqual(['gofumpt project config changed: .golangci.yml']);
    expect(
      between({ base: at('extra: 1\n'), head: at('extra: 2\n'), config: { preset: 'go' } })
        .policyLoosenings,
    ).toEqual([]);
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
    'reads what an edit of the knip config a %s project opted into applies, imports included',
    (preset) => {
      const config = { ...(preset === undefined ? {} : { preset }), tools: { knip: PROJECT } };
      const at = (files) => ({ 'src/a.ts': 'export const a = 1;\n', ...files });
      const manifest = (extra) => JSON.stringify({ name: 'x', ...extra });
      const base = at({
        'knip.ts': "import ignore from './tools/ignore.js';\nexport default { ignore };\n",
        'tools/ignore.js': 'export default [];\n',
        'package.json': manifest(),
      });
      const edited = (files) => between({ base, head: at({ ...base, ...files }), config });

      expect(changesOf(edited({ 'tools/ignore.js': "export default ['src/**'];\n" }))).toEqual({
        policyLoosenings: ['knip knip.ts ignore: [] -> ["src/**"]'],
        policyChanges: ['knip knip.ts ignore: [] -> ["src/**"]'],
      });
      expect(edited({ 'package.json': manifest({ version: '2.0.0' }) }).policyLoosenings).toEqual(
        [],
      );
      expect(
        edited({ 'package.json': manifest({ knip: { entry: ['src/a.ts'] } }) }).policyLoosenings,
      ).toEqual(['knip knip.ts and package.json entry: not set -> ["src/a.ts"]']);
      expect(
        between({
          base,
          head: at({ ...base, 'knip.json': '{"ignore":["src/**"]}' }),
          config: { tools: {} },
        }).policyLoosenings,
      ).toEqual([]);
    },
  );
  it('reads a knip.jsonc edit per key, without comments, order or removed ignores loosening', () => {
    const config = { preset: 'typescript', tools: { knip: PROJECT } };
    const at = (knip) => ({ 'knip.jsonc': knip, 'src/a.ts': 'export const a = 1;\n' });
    const base = at('{ "ignore": ["a/**", "b/**"], "entry": ["x.ts"] }');
    const changes = (knip) => changesOf(between({ base, head: at(knip), config }));

    expect(changes('// ours\n{ "entry": ["x.ts"], "ignore": ["b/**", "a/**"], }')).toEqual({
      policyLoosenings: [],
      policyChanges: [],
    });
    expect(changes('{ "ignore": ["a/**"], "entry": ["x.ts"] }')).toEqual({
      policyLoosenings: [],
      policyChanges: ['knip knip.jsonc ignore: ["a/**","b/**"] -> ["a/**"]'],
    });
    expect(changes('{ "ignore": ["a/**", "b/**"], "entry": ["x.ts"], "$schema": "x" }')).toEqual({
      policyLoosenings: [],
      policyChanges: [],
    });
  });
  it('falls back to the files when a side of the knip config cannot be read', () => {
    const config = { preset: 'typescript', tools: { knip: PROJECT } };
    const at = (knip) => ({ 'knip.json': knip, 'src/a.ts': 'export const a = 1;\n' });
    expect(
      between({ base: at('{ "ignore": [] }'), head: at('{ "ignore": ['), config }).policyLoosenings,
    ).toEqual(['knip project config changed: knip.json']);
  });
  it.each([undefined, 'javascript'])(
    'reads what an edit of the dependency-cruiser config a %s project opted into applies',
    (preset) => {
      const config = {
        ...(preset === undefined ? {} : { preset }),
        tools: { 'dependency-cruiser': PROJECT },
      };
      const rule = "{ name: 'no-lib', from: { path: '^src' }, to: { path: '^lib' } }";
      const at = (rules) => ({
        'src/a.ts': 'export const a = 1;\n',
        'tools/rules.cjs': `module.exports = [${rules}];\n`,
        '.dependency-cruiser.cjs':
          "// ours\nmodule.exports = { forbidden: require('./tools/rules.cjs') };\n",
      });
      const dropped =
        'dependency-cruiser .dependency-cruiser.cjs forbidden: ' +
        '[{"name":"no-lib","from":{"path":"^src"},"to":{"path":"^lib"}}] -> []';
      expect(changesOf(between({ base: at(rule), head: at(''), config }))).toEqual({
        policyLoosenings: [dropped],
        policyChanges: [dropped],
      });
    },
  );
  it('reads a .dependency-cruiser.json edit per key, without the options nitpicker owns', () => {
    const config = { preset: 'typescript', tools: { 'dependency-cruiser': PROJECT } };
    const rule = { name: 'no-lib', from: { path: '^src' }, to: { path: '^lib' } };
    const unnamed = { from: { path: '^src' }, to: { path: '^vendor' } };
    const at = (cruiser) => ({
      'src/a.ts': 'export const a = 1;\n',
      '.dependency-cruiser.json': JSON.stringify({ forbidden: [rule], ...cruiser }),
    });
    const changes = (cruiser) => changesOf(between({ base: at({}), head: at(cruiser), config }));
    const label = 'dependency-cruiser .dependency-cruiser.json';

    expect(changes({ options: { tsPreCompilationDeps: false, outputType: 'dot' } })).toEqual({
      policyLoosenings: [],
      policyChanges: [],
    });
    expect(changes({ options: { exclude: { path: '^gen' } } })).toEqual({
      policyLoosenings: [`${label} options.exclude: not set -> ["path ^gen"]`],
      policyChanges: [`${label} options.exclude: not set -> ["path ^gen"]`],
    });
    const added = `${label} forbidden: ${JSON.stringify([rule])} -> ${JSON.stringify([rule, unnamed])}`;
    expect(changes({ forbidden: [unnamed, rule] })).toEqual({
      policyLoosenings: [],
      policyChanges: [added],
    });
  });
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
      'knip knip.json ignore: not set -> ["src/**"]',
      'tools.knip.precedence: not set -> ["project","nitpicker"]',
    ]);
  });
  it.each(['typescript', 'python', 'java', 'kotlin'])(
    'counts an edit of the opted-in .jscpd.json with the %s preset, not a reformat',
    (preset) => {
      const at = (jscpd) => ({ '.jscpd.json': jscpd, 'README.md': 'x\n' });
      const config = { preset, tools: { jscpd: PROJECT } };
      const base = at('{"minTokens": 50}');

      expect(between({ base, head: at('{"minTokens": 500}'), config }).policyLoosenings).toEqual([
        'jscpd .jscpd.json minTokens: 50 -> 500',
      ]);
      expect(changesOf(between({ base, head: at('{"minTokens": 10}'), config }))).toEqual({
        policyLoosenings: [],
        policyChanges: ['jscpd .jscpd.json minTokens: 50 -> 10'],
      });
      expect(
        between({ base, head: at('{\n  "minTokens": 50\n}\n'), config }).policyLoosenings,
      ).toEqual([]);
      expect(
        between({ base, head: at('{"minTokens": 500}'), config: { preset } }).policyLoosenings,
      ).toEqual([]);
      expect(
        between({ base, head: at('{"reporters": ["html"], "minTokens": 50}'), config })
          .policyLoosenings,
      ).toEqual([]);
    },
  );
  it.each(['typescript', 'python', 'java', 'kotlin'])(
    'shows the .jscpd.json a %s change opts into in the same change',
    (preset) => {
      const files = { '.jscpd.json': '{"minTokens": 5000}', 'README.md': 'x\n' };
      expect(
        between({
          base: files,
          head: files,
          baseConfig: { preset },
          config: { preset, tools: { jscpd: PROJECT } },
        }).policyLoosenings,
      ).toEqual([
        'jscpd .jscpd.json minTokens: not set -> 5000',
        'tools.jscpd.precedence: not set -> ["project","nitpicker"]',
      ]);
    },
  );
});

describe('what an edit of .jscpd.json changes', () => {
  const config = { preset: 'python', tools: { jscpd: PROJECT } };
  const at = (jscpd) => ({ '.jscpd.json': JSON.stringify(jscpd), 'README.md': 'x\n' });

  it.each([
    [{ minLines: 5 }, { minLines: 9 }, 'loosened', 'minLines: 5 -> 9'],
    [{}, { minLines: 3 }, 'changed', 'minLines: not set -> 3'],
    [{}, { maxLines: 900 }, 'loosened', 'maxLines: not set -> 900'],
    [{ maxLines: 900 }, { maxLines: 2000 }, 'changed', 'maxLines: 900 -> 2000'],
    [{ maxSize: '1mb' }, { maxSize: '100kb' }, 'loosened', 'maxSize: "1mb" -> "100kb"'],
    [{ maxSize: '100kb' }, {}, 'changed', 'maxSize: "100kb" -> not set'],
    [{}, { mode: 'strict' }, 'loosened', 'mode: not set -> "strict"'],
    [{}, { skipComments: true }, 'changed', 'mode: not set -> "weak"'],
    [{ ignoreCase: true }, {}, 'loosened', 'ignoreCase: true -> not set'],
    [{ ignore: ['a/**'] }, { ignore: ['b/**'] }, 'loosened', 'ignore: ["a/**"] -> ["b/**"]'],
    [
      { ignore: ['a/**', 'b/**'] },
      { ignore: ['a/**'] },
      'changed',
      'ignore: ["a/**","b/**"] -> ["a/**"]',
    ],
    [{}, { ignorePattern: ['^import'] }, 'loosened', 'ignorePattern: not set -> ["^import"]'],
  ])('reads %j -> %j as %s', (base, head, kind, text) => {
    const { policyLoosenings, policyChanges } = between({ base: at(base), head: at(head), config });
    expect(policyChanges).toEqual([`jscpd .jscpd.json ${text}`]);
    expect(policyLoosenings).toEqual(kind === 'loosened' ? policyChanges : []);
  });

  it('falls back to the file when one side cannot be read', () => {
    expect(
      between({ base: at({ minTokens: 50 }), head: at({ minTokens: 0 }), config }).policyLoosenings,
    ).toEqual(['jscpd project config changed: .jscpd.json']);
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
