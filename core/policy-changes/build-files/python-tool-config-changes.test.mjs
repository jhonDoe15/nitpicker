import { describe, expect, it } from 'vitest';
import { between, changesOf } from './test-support/policy-fixtures.mjs';

const PROJECT = { precedence: ['project', 'nitpicker'] };

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

  it('shows the config a change opts into in the same change, with opt-in guidance', () => {
    const files = { ...SOURCE, 'mypy.ini': '[mypy]\ndisallow_untyped_defs = False\n' };
    const optIn = between({
      base: files,
      head: files,
      baseConfig: { preset: 'python' },
      config: python('mypy'),
    });
    const edit = between({
      base: files,
      head: { ...files, 'mypy.ini': '[mypy]\ndisallow_untyped_defs = True\n' },
      config: python('mypy'),
    });

    expect(optIn.policyLoosenings).toEqual([
      'mypy project config changed: mypy.ini',
      'tools.mypy.precedence: not set -> ["project","nitpicker"]',
    ]);
    expect(optIn.policyKinds['mypy project config changed: mypy.ini']).toBe('tool-config-opt-in');
    expect(edit.policyKinds['mypy project config changed: mypy.ini']).toBe('tool-config');
  });

  it('labels a config above a subfolder project by its repository path', () => {
    const at = (lineLength) => ({
      'ruff.toml': `line-length = ${lineLength}\n`,
      'packages/api/src/shop/__init__.py': '',
      'packages/api/pyproject.toml':
        '[tool.poetry]\nname = "api"\n\n[tool.black]\nline-length = 90\n',
    });
    const change = (head) =>
      between({ base: at(100), head, config: python('ruff', 'black'), folder: 'packages/api' });

    expect(change(at(100)).policyLoosenings).toEqual([]);
    expect(change(at(120)).policyLoosenings).toEqual(['ruff project config changed: ruff.toml']);
    expect(change(at(120)).policyDigest).not.toBe(change(at(130)).policyDigest);
  });

  it('stays quiet for a tool the project did not opt into and outside the python preset', () => {
    const base = { 'pyproject.toml': PYPROJECT };
    const head = { 'pyproject.toml': PYPROJECT.replace('["E", "F"]', '["F"]') };

    expect(loosenings(base, head, python('black', 'mypy'))).toEqual([]);
    expect(loosenings(base, head, { preset: 'python' })).toEqual([]);
    expect(loosenings(base, head, { preset: 'typescript', tools: { ruff: PROJECT } })).toEqual([]);
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

  it('counts any edit of a config that no longer parses', () => {
    expect(
      loosenings(
        { 'ruff.toml': '[lint]\nselect = ["F"]\n' },
        { 'ruff.toml': '[lint\nselect = ["F"]\n' },
        python('ruff'),
      ),
    ).toEqual(['ruff project config changed: ruff.toml']);
  });
});

describe('import-linter contracts the gate runs', () => {
  const PYTHON = { preset: 'python' };
  const SOURCE = { 'src/shop/__init__.py': '' };
  const contracts = ({ layers = 'shop.api\n    shop.domain', extra = '', session = '' } = {}) => ({
    ...SOURCE,
    '.importlinter': `[importlinter]\nroot_package = shop\n${session}\n[importlinter:contract:layers]\nname = Layers\ntype = layers\nlayers =\n    ${layers}\n${extra}`,
  });
  const changes = (base, head, { config = PYTHON, baseConfig = config } = {}) =>
    changesOf(between({ base, head, config, baseConfig }));
  const FORBIDDEN =
    '\n[importlinter:contract:pure]\nname = Pure\ntype = forbidden\nsource_modules = shop.domain\nforbidden_modules =\n    shop.web\n    shop.db\n';

  it('fails a dropped layer or contract and lists an added one', () => {
    const base = contracts({ extra: FORBIDDEN });

    expect(changes(base, contracts({ layers: 'shop.api', extra: FORBIDDEN }))).toEqual({
      policyLoosenings: [
        'import-linter contract layers layers: ["shop.api","shop.domain"] -> ["shop.api"]',
      ],
      policyChanges: [
        'import-linter contract layers layers: ["shop.api","shop.domain"] -> ["shop.api"]',
      ],
    });
    expect(changes(base, contracts())).toEqual({
      policyLoosenings: ['import-linter contract pure removed'],
      policyChanges: ['import-linter contract pure removed'],
    });
    expect(changes(contracts(), base)).toEqual({
      policyLoosenings: [],
      policyChanges: ['import-linter contract pure added'],
    });
    expect(
      changes(
        base,
        contracts({ layers: 'shop.cli\n    shop.api\n    shop.domain', extra: FORBIDDEN }),
      ).policyLoosenings,
    ).toEqual([]);
  });

  it('fails an added ignored import, a narrowed module list and a relaxed alert', () => {
    const tweak = (from, to) => contracts({ extra: FORBIDDEN.replace(from, to) });
    const base = contracts({ extra: FORBIDDEN });

    expect(
      changes(
        base,
        tweak(
          'type = forbidden\n',
          'type = forbidden\nignore_imports = shop.domain.a -> shop.db\n',
        ),
      ).policyLoosenings,
    ).toEqual([
      'import-linter contract pure ignore_imports: not set -> "shop.domain.a -> shop.db"',
    ]);
    expect(changes(base, tweak('    shop.db\n', '')).policyLoosenings).toEqual([
      'import-linter contract pure forbidden_modules: ["shop.web","shop.db"] -> ["shop.web"]',
    ]);
    expect(
      changes(base, tweak('    shop.db\n', '    shop.db\n    shop.cache\n')).policyLoosenings,
    ).toEqual([]);
    expect(
      changes(
        base,
        tweak('type = forbidden\n', 'type = forbidden\nunmatched_ignore_imports_alerting = none\n'),
      ).policyLoosenings,
    ).toEqual(['import-linter contract pure unmatched_ignore_imports_alerting: not set -> "none"']);
    expect(
      changes(
        base,
        contracts({ session: 'exclude_type_checking_imports = True\n', extra: FORBIDDEN }),
      ).policyLoosenings,
    ).toEqual(['import-linter exclude_type_checking_imports: not set -> "True"']);
  });

  it('fails a deleted file, a dropped table and a renamed section', () => {
    const pyproject = (table) => ({
      ...SOURCE,
      'pyproject.toml': `[tool.poetry]\nname = "shop"\n\n[${table}]\nroot_package = "shop"\n`,
    });
    const setupCfg = (section) => ({
      ...SOURCE,
      'setup.cfg': `[metadata]\nname = shop\n\n[${section}]\nroot_package = shop\n`,
    });

    expect(changes(contracts(), SOURCE).policyLoosenings).toEqual([
      'import-linter contracts removed: .importlinter',
    ]);
    expect(
      changes(pyproject('tool.importlinter'), pyproject('tool.other')).policyLoosenings,
    ).toEqual(['import-linter contracts removed: pyproject.toml']);
    expect(changes(setupCfg('importlinter'), setupCfg('import-linter')).policyLoosenings).toEqual([
      'import-linter contracts removed: setup.cfg',
    ]);
    expect(changes(setupCfg('importlinter'), setupCfg('importlinter')).policyChanges).toEqual([]);
  });

  it('lists the contracts a change turns on, and stays quiet when they are off or not python', () => {
    const off = { preset: 'python', python: { importLinter: false } };

    expect(changes(contracts(), contracts(), { baseConfig: off, config: PYTHON })).toEqual({
      policyLoosenings: [],
      policyChanges: [
        'import-linter contracts added: .importlinter',
        'python.importLinter: false -> not set',
      ],
    });
    expect(
      changes(contracts(), contracts({ layers: 'shop.api' }), { config: off }).policyChanges,
    ).toEqual([]);
    expect(changes(contracts(), SOURCE, { baseConfig: PYTHON, config: off })).toEqual({
      policyLoosenings: ['python.importLinter: not set -> false'],
      policyChanges: ['python.importLinter: not set -> false'],
    });
    expect(
      changes(contracts(), contracts({ layers: 'shop.api' }), { config: { preset: 'java' } })
        .policyChanges,
    ).toEqual([]);
  });
});
