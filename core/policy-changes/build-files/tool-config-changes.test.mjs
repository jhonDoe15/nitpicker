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

describe('what an edit of the Stryker config changes', () => {
  const NONE = { policyLoosenings: [], policyChanges: [] };
  const OPTED_IN = { tools: { stryker: PROJECT } };
  const strykerAt = (file, config) => ({
    [file]: JSON.stringify(config),
    'src/a.ts': 'export const a = 1;\n',
  });
  const at = (config) => strykerAt('stryker.config.json', config);
  const excluding = (...names) => ({ mutator: { excludedMutations: names } });

  it.each([undefined, 'javascript'])(
    'lists a loosened exclusion list with the %s preset',
    (preset) => {
      const config = { preset, ...OPTED_IN };
      const { policyLoosenings } = between({
        base: at(excluding()),
        head: at(excluding('StringLiteral')),
        config,
      });

      expect(policyLoosenings).toEqual([
        'stryker stryker.config.json mutator.excludedMutations: [] -> ["StringLiteral"]',
      ]);
      expect(
        between({ base: at(excluding()), head: at(excluding('StringLiteral')), config: { preset } })
          .policyLoosenings,
      ).toEqual([]);
    },
  );

  it('follows the values a config imports, not its text', () => {
    const module = (list) => ({
      'stryker.config.mjs':
        "import excluded from './excluded.mjs';\nexport default { mutator: { excludedMutations: excluded } };\n",
      'excluded.mjs': `export default ${JSON.stringify(list)};\n`,
      'src/a.ts': 'export const a = 1;\n',
    });

    expect(
      between({
        base: module([]),
        head: module(['StringLiteral', 'ArrowFunction']),
        config: OPTED_IN,
      }).policyLoosenings,
    ).toEqual([
      'stryker stryker.config.mjs mutator.excludedMutations: [] -> ["StringLiteral","ArrowFunction"]',
    ]);
    expect(
      changesOf(
        between({ base: module([]), head: { ...module([]), 'notes.md': 'x\n' }, config: OPTED_IN }),
      ),
    ).toEqual(NONE);
  });

  it('counts a deleted winning config as loosening when a weaker one takes over', () => {
    const base = {
      ...strykerAt('stryker.conf.json', excluding()),
      ...strykerAt('.stryker.conf.json', excluding('StringLiteral')),
    };
    const head = without(base, 'stryker.conf.json');

    expect(between({ base, head, config: OPTED_IN }).policyLoosenings).toEqual([
      'stryker .stryker.conf.json mutator.excludedMutations: [] -> ["StringLiteral"]',
    ]);
    expect(
      changesOf(
        between({ base: at(excluding('A')), head: { 'src/a.ts': 'x\n' }, config: OPTED_IN }),
      ),
    ).toEqual({
      policyLoosenings: [],
      policyChanges: ['stryker stryker.config.json mutator.excludedMutations: ["A"] -> not set'],
    });
  });

  it('ignores edits to keys nitpicker does not read, comments and layout', () => {
    const base = at({ concurrency: 2, mutate: ['src/**'], reporters: ['json'] });
    const head = {
      'stryker.config.json':
        '{\n  "concurrency": 2,\n  "mutate": ["lib/**"],\n  "reporters": ["html"],\n  "thresholds": { "break": 0 }\n}\n',
      'src/a.ts': 'export const a = 1;\n',
    };

    expect(changesOf(between({ base, head, config: OPTED_IN }))).toEqual(NONE);
  });

  it.each([
    [{ ignoreStatic: true }, { ignoreStatic: false }, 'ignoreStatic: true -> false'],
    [excluding('A', 'B'), excluding('A'), 'mutator.excludedMutations: ["A","B"] -> ["A"]'],
    [
      { ignorePatterns: ['a', 'b'] },
      { ignorePatterns: ['a'] },
      'ignorePatterns: ["a","b"] -> ["a"]',
    ],
    [{ timeoutMS: 1000 }, { timeoutMS: 90_000 }, 'timeoutMS: 1000 -> 90000'],
  ])('reads %j -> %j as a plain change', (base, head, text) => {
    expect(changesOf(between({ base: at(base), head: at(head), config: OPTED_IN }))).toEqual({
      policyLoosenings: [],
      policyChanges: [`stryker stryker.config.json ${text}`],
    });
  });

  it.each([
    [{}, { ignoreStatic: true }, 'ignoreStatic: not set -> true'],
    [{}, { ignorePatterns: ['src'] }, 'ignorePatterns: not set -> ["src"]'],
    [
      { testRunnerNodeArgs: ['a'] },
      { testRunnerNodeArgs: ['a', 'b'] },
      'testRunnerNodeArgs: ["a"] -> ["a","b"]',
    ],
    [{}, { checkerNodeArgs: ['--x'] }, 'checkerNodeArgs: not set -> ["--x"]'],
    [{}, { mutator: { plugins: ['p'] } }, 'mutator.plugins: not set -> ["p"]'],
  ])('reads %j -> %j as loosening', (base, head, text) => {
    expect(between({ base: at(base), head: at(head), config: OPTED_IN }).policyLoosenings).toEqual([
      `stryker stryker.config.json ${text}`,
    ]);
  });

  it('lists the values the config starts to apply when the change opts in', () => {
    const files = at({ ignoreStatic: true, concurrency: 2, reporters: ['html'] });
    const result = between({ base: files, head: files, baseConfig: {}, config: OPTED_IN });

    expect(changesOf(result)).toEqual({
      policyLoosenings: [
        'stryker stryker.config.json ignoreStatic: not set -> true',
        'tools.stryker.precedence: not set -> ["project","nitpicker"]',
      ],
      policyChanges: [
        'stryker stryker.config.json ignoreStatic: not set -> true',
        'tools.stryker.precedence: not set -> ["project","nitpicker"]',
        'stryker stryker.config.json concurrency: not set -> 2',
      ],
    });
  });

  it('does not read the config once the change removes the opt-in', () => {
    const files = at({ ignoreStatic: true });
    const result = between({
      base: files,
      head: at({ ignoreStatic: false }),
      baseConfig: OPTED_IN,
      config: {},
    });

    expect(changesOf(result)).toEqual({
      policyLoosenings: [],
      policyChanges: ['tools.stryker.precedence: ["project","nitpicker"] -> not set'],
    });
  });

  it('falls back to the file text when a side cannot be loaded', () => {
    const broken = { 'stryker.config.mjs': "throw new Error('boom');\n", 'src/a.ts': 'x\n' };
    const edited = { 'stryker.config.mjs': "throw new Error('bang');\n", 'src/a.ts': 'x\n' };

    expect(between({ base: broken, head: edited, config: OPTED_IN }).policyLoosenings).toEqual([
      'stryker project config changed: stryker.config.mjs',
    ]);
    expect(between({ base: broken, head: broken, config: OPTED_IN }).policyLoosenings).toEqual([]);
  });
});
