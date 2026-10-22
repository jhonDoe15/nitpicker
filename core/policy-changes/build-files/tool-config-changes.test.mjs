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

describe('python tool configs the project opted into', () => {
  const python = (...tools) => ({
    preset: 'python',
    tools: Object.fromEntries(tools.map((tool) => [tool, PROJECT])),
  });
  const SOURCE = { 'src/shop/__init__.py': '' };
  const loosenings = (base, head, config) =>
    between({ base: { ...SOURCE, ...base }, head: { ...SOURCE, ...head }, config })
      .policyLoosenings;
  const PYPROJECT = [
    '[tool.poetry]',
    'name = "shop"',
    '',
    '[tool.ruff.lint]',
    'select = ["E", "F"]',
    '',
    '[tool.black]',
    'line-length = 100',
    '',
    '[tool.mypy]',
    'strict = true',
    '',
    '[tool.pyright]',
    'pythonVersion = "3.12"',
    '',
    '[tool.mutmut]',
    'paths_to_mutate = ["src"]',
    '',
  ].join('\n');
  const ALL = python('ruff', 'black', 'pyright', 'mypy', 'mutmut');

  it('counts an edit of each opted-in table of pyproject.toml, and only that table', () => {
    const base = { 'pyproject.toml': PYPROJECT };
    const edited = (from, to) => ({ 'pyproject.toml': PYPROJECT.replace(from, to) });

    expect(loosenings(base, edited('name = "shop"', 'name = "store"'), ALL)).toEqual([]);
    expect(loosenings(base, edited('["E", "F"]', '["F"]'), ALL)).toEqual([
      'ruff project config changed: pyproject.toml',
    ]);
    expect(loosenings(base, edited('line-length = 100', 'line-length = 120'), ALL)).toEqual([
      'black project config changed: pyproject.toml',
    ]);
    expect(loosenings(base, edited('strict = true', 'strict = false'), ALL)).toEqual([
      'mypy project config changed: pyproject.toml',
    ]);
    expect(loosenings(base, edited('"3.12"', '"3.11"'), ALL)).toEqual([
      'pyright project config changed: pyproject.toml',
    ]);
    expect(loosenings(base, edited('["src"]', '["src/shop"]'), ALL)).toEqual([
      'mutmut project config changed: pyproject.toml',
    ]);
  });

  it('ignores comments, layout and key order in the opted-in tables', () => {
    const reordered = [
      '# house style',
      '[tool.ruff.lint]',
      'select = [',
      '  "E",  # errors',
      '  "F",',
      ']',
      '',
      '[tool.poetry]',
      'name = "shop"',
      '[tool.pyright]',
      'pythonVersion   =   "3.12"',
      '[tool.mypy]',
      'strict = true',
      '[tool.mutmut]',
      'paths_to_mutate = ["src"]',
      '[tool.black]',
      'line-length = 100',
    ].join('\n');

    expect(
      loosenings({ 'pyproject.toml': PYPROJECT }, { 'pyproject.toml': reordered }, ALL),
    ).toEqual([]);
  });

  it('stays quiet for a tool the project did not opt into and outside the python preset', () => {
    const base = { 'pyproject.toml': PYPROJECT };
    const head = { 'pyproject.toml': PYPROJECT.replace('["E", "F"]', '["F"]') };

    expect(loosenings(base, head, python('black', 'mypy'))).toEqual([]);
    expect(loosenings(base, head, { preset: 'python' })).toEqual([]);
  });

  it('follows the ruff config ruff reads, with its extend chain', () => {
    const at = (shared, pyproject = '[tool.ruff]\nline-length = 90\n') => ({
      'pyproject.toml': pyproject,
      'ruff.toml': 'extend = "config/shared.toml"\n[lint]\nselect = ["F"]\n',
      'config/shared.toml': shared,
    });
    const shared = '[lint]\nignore = []\n';

    expect(loosenings(at(shared), at('[lint]\nignore = ["F401"]\n'), python('ruff'))).toEqual([
      'ruff project config changed: config/shared.toml',
    ]);
    expect(
      loosenings(at(shared), at(shared, '[tool.ruff]\nline-length = 70\n'), python('ruff')),
    ).toEqual([]);
  });

  it('counts a ruff config the head adds and reports one it removes', () => {
    const config = python('ruff');

    expect(loosenings({}, { '.ruff.toml': '[lint]\nignore = ["F401"]\n' }, config)).toEqual([
      'ruff project config changed: .ruff.toml',
    ]);
    expect(
      changesOf(
        between({ base: { ...SOURCE, 'ruff.toml': 'line-length = 90\n' }, head: SOURCE, config }),
      ),
    ).toEqual({ policyLoosenings: [], policyChanges: ['ruff project config removed: ruff.toml'] });
  });

  it('reads pyrightconfig.json as JSON with comments and follows its extends', () => {
    const at = (own, shared) => ({ 'pyrightconfig.json': own, 'config/base.json': shared });
    const own = '{\n  // shared\n  "extends": "config/base.json",\n  "strict": ["src"],\n}\n';
    const base = at(own, '{"reportMissingImports": "error"}');
    const recommented = at(
      own.replace('// shared', '// more'),
      '{ "reportMissingImports": "error" }',
    );

    expect(loosenings(base, recommented, python('pyright'))).toEqual([]);
    expect(
      loosenings(base, at(own, '{"reportMissingImports": "none"}'), python('pyright')),
    ).toEqual(['pyright project config changed: config/base.json']);
  });

  it('reads only the mypy sections of setup.cfg, and only the file mypy reads', () => {
    const cfg = (flake8, legacy) => ({
      'setup.cfg': `[flake8]\nmax-line-length = ${flake8}\n\n[mypy]\nstrict = True\n\n[mypy-shop.legacy]\nignore_errors = ${legacy}\n`,
    });
    const config = python('mypy');

    expect(loosenings(cfg(80, 'False'), cfg(120, 'False'), config)).toEqual([]);
    expect(loosenings(cfg(80, 'False'), cfg(80, 'True'), config)).toEqual([
      'mypy project config changed: setup.cfg',
    ]);
    expect(
      loosenings(
        { 'mypy.ini': '[mypy]\nstrict = True\n', ...cfg(80, 'False') },
        { 'mypy.ini': '; strict\n[mypy]\nstrict   = True\n', ...cfg(80, 'True') },
        config,
      ),
    ).toEqual([]);
  });

  it('reads the [mutmut] section of setup.cfg when pyproject.toml has no [tool.mutmut]', () => {
    const at = (mutmut) => ({
      'pyproject.toml': '[tool.poetry]\nname = "shop"\n',
      'setup.cfg': `[metadata]\nname = shop\n\n[mutmut]\npaths_to_mutate = ${mutmut}\n`,
    });

    expect(loosenings(at('src'), at('src/shop'), python('mutmut'))).toEqual([
      'mutmut project config changed: setup.cfg',
    ]);
  });

  it('counts any edit of a config that no longer parses', () => {
    expect(
      loosenings(
        { 'ruff.toml': '[lint]\nselect = ["F"]\n' },
        { 'ruff.toml': '[lint\nselect = ["F"]\n' },
        python('ruff'),
      ),
    ).toEqual(['ruff project config changed: ruff.toml']);
  });

  it('reads the coverage sections of the file coverage reads', () => {
    const cfg = (flake8, excluded) => ({
      'setup.cfg': `[flake8]\nmax-line-length = ${flake8}\n\n[coverage:report]\nexclude_also =\n    ${excluded}\n`,
      'pyproject.toml': '[tool.coverage.report]\nexclude_also = ["unused"]\n',
    });
    const config = python('coverage');

    expect(loosenings(cfg(80, 'def __repr__'), cfg(120, 'def __repr__'), config)).toEqual([]);
    expect(loosenings(cfg(80, 'def __repr__'), cfg(80, 'pragma: no cover'), config)).toEqual([
      'coverage project config changed: setup.cfg',
    ]);
    expect(
      loosenings(
        { '.coveragerc': '[report]\nexclude_also = x\n' },
        { '.coveragerc': '# kept\n[report]\nexclude_also =   x\n' },
        config,
      ),
    ).toEqual([]);
  });
});
