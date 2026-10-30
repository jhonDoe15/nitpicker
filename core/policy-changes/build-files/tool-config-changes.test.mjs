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

describe('the ESLint flat config the project opted into', () => {
  const at = (config, rules = "export default { 'no-console': 'error' };\n") => ({
    'eslint.config.mjs': config,
    'eslint/rules.mjs': rules,
    'eslint/unused.mjs': 'export default {};\n',
    'src/a.ts': 'export const a = 1;\n',
  });
  const CONFIG = "import rules from './eslint/rules.mjs';\nexport default [{ rules }];\n";

  it.each([
    ['typescript', ['project', 'nitpicker']],
    ['javascript', ['project']],
    ['typescript', ['nitpicker', 'project']],
  ])(
    'counts an edit of the %s config or a local file it imports, listing %j',
    (preset, precedence) => {
      const config = { preset, tools: { eslint: { precedence } } };
      const base = at(CONFIG);

      expect(
        between({ base, head: at(`// house rules\n${CONFIG}`), config }).policyLoosenings,
      ).toEqual([]);
      expect(
        between({ base, head: at(CONFIG.replace('[{', '[{ ignores: ["src/**"] }, {')), config })
          .policyLoosenings,
      ).toEqual(['eslint project config changed: eslint.config.mjs']);
      expect(
        between({ base, head: at(CONFIG, "export default { 'no-console': 'off' };\n"), config })
          .policyLoosenings,
      ).toEqual(['eslint project config changed: eslint/rules.mjs']);
      expect(
        between({ base, head: { ...base, 'eslint/unused.mjs': 'export default 1;\n' }, config })
          .policyLoosenings,
      ).toEqual([]);
    },
  );

  it('stays quiet while the project has not opted in, and lists a removed config', () => {
    const optedIn = { tools: { eslint: { precedence: ['project', 'nitpicker'] } } };
    const base = at(CONFIG);
    const edited = at(CONFIG, "export default { 'no-console': 'off' };\n");

    expect(between({ base, head: edited, config: { tools: {} } }).policyLoosenings).toEqual([]);
    expect(
      changesOf(between({ base, head: without(base, 'eslint.config.mjs'), config: optedIn })),
    ).toEqual({
      policyLoosenings: [],
      policyChanges: [
        'eslint project config removed: eslint.config.mjs',
        'eslint project config removed: eslint/rules.mjs',
      ],
    });
  });

  it('lists every file an opt-in starts reading, the opt-in itself included', () => {
    const files = { ...at(CONFIG), '.gitignore': 'dist/\n' };
    const config = (precedence) => ({ tools: { eslint: { precedence } } });

    expect(
      between({
        base: files,
        head: files,
        baseConfig: config(['nitpicker']),
        config: config(['nitpicker', 'project']),
      }).policyLoosenings,
    ).toEqual([
      'eslint project config changed: eslint.config.mjs',
      'eslint project config changed: eslint/rules.mjs',
      'tools.eslint.precedence: ["nitpicker"] -> ["nitpicker","project"]',
    ]);
  });

  it('counts the ignore file the config reads, but not a comment after code', () => {
    const optedIn = { tools: { eslint: { precedence: ['project'] } } };
    const ignoring = (gitignore, config = 'export default [ignored];\n') => ({
      ...at(
        `import { includeIgnoreFile } from '@eslint/compat';\nconst ignored = includeIgnoreFile(new URL('.gitignore', import.meta.url).pathname);\n${config}`,
      ),
      '.gitignore': gitignore,
    });
    const base = ignoring('dist/\n');

    expect(
      between({
        base,
        head: ignoring('# build\ndist/\n', 'export default [ignored]; // house\n'),
        config: optedIn,
      }).policyLoosenings,
    ).toEqual([]);
    expect(
      between({ base, head: ignoring('dist/\nsrc/\n'), config: optedIn }).policyLoosenings,
    ).toEqual(['eslint project config changed: .gitignore']);
  });

  it('lists the nitpicker rules whose options the project replaces once a reviewed file changes', () => {
    const config = (precedence) => ({ tools: { eslint: { precedence } } });
    const base = at(CONFIG);
    const head = at(
      CONFIG,
      "export default { 'no-empty': ['error', { allowEmptyCatch: true }] };\n",
    );
    const replacedOptions = () => ({ rules: ['no-empty'] });
    const unloadable = () => ({
      error: 'ESLint config eslint.config.mjs could not be loaded: boom',
    });

    expect(
      between({ base, head, config: config(['project']), replacedOptions }).policyLoosenings,
    ).toEqual([
      'eslint project config changed: eslint/rules.mjs',
      'eslint project config replaces the options of nitpicker rule no-empty',
    ]);
    expect(
      between({ base, head, config: config(['project']), replacedOptions: unloadable })
        .policyLoosenings,
    ).toEqual([
      'eslint project config changed: eslint/rules.mjs',
      'eslint project config could not be loaded to list the nitpicker rules whose options it replaces: ESLint config eslint.config.mjs could not be loaded: boom',
    ]);
    expect(
      between({ base, head: base, config: config(['project']), replacedOptions }).policyLoosenings,
    ).toEqual([]);
    expect(
      between({ base, head, config: config(['nitpicker', 'project']), replacedOptions })
        .policyLoosenings,
    ).toEqual(['eslint project config changed: eslint/rules.mjs']);
  });

  it('follows the config file ESLint itself loads first', () => {
    const optedIn = { tools: { eslint: { precedence: ['project'] } } };
    const both = (javascript) => ({ ...at(CONFIG), 'eslint.config.js': javascript });

    expect(
      between({
        base: both('export default [];\n'),
        head: both('export default [{}];\n'),
        config: optedIn,
      }).policyLoosenings,
    ).toEqual(['eslint project config changed: eslint.config.js']);
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
