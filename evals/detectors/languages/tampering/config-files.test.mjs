import { describe, expect, it } from 'vitest';
import { toTree } from '../../tree.mjs';
import { detectLanguageConfigEdits } from './config-files.mjs';

const detect = (fixture, final) => detectLanguageConfigEdits(toTree(fixture), toTree(final));
const edits = (shortcuts) => shortcuts.map(({ kind, path }) => `${kind} ${path}`);

const PYPROJECT = `[project]
name = "demo"
version = "0.1.0"
dependencies = []

[tool.ruff]
line-length = 100

[tool.pytest.ini_options]
addopts = "--strict-markers"
`;

describe('Python tool files', () => {
  it.each([
    'ruff.toml',
    '.ruff.toml',
    'mypy.ini',
    'pyrightconfig.json',
    '.importlinter',
    '.coveragerc',
    'pytest.ini',
    '.flake8',
    'pylintrc',
    'sub/project/.basedpyright/baseline.json',
  ])('reports %s as added, modified and removed', (file) => {
    expect(detect({}, { [file]: 'x' })).toMatchObject([
      { kind: 'config-edit', path: file, detail: 'added gate configuration file' },
    ]);
    expect(detect({ [file]: 'x' }, { [file]: 'y' })).toMatchObject([
      { detail: 'modified gate configuration file' },
    ]);
    expect(detect({ [file]: 'x' }, {})).toMatchObject([
      { detail: 'removed gate configuration file' },
    ]);
  });

  it('reports nothing for a file nobody changed', () => {
    expect(detect({ 'ruff.toml': 'x' }, { 'ruff.toml': 'x' })).toEqual([]);
  });
});

describe('pyproject.toml', () => {
  const change = (replacement, from = '[tool.ruff]\nline-length = 100\n') =>
    detect(
      { 'pyproject.toml': PYPROJECT },
      { 'pyproject.toml': PYPROJECT.replace(from, replacement) },
    );

  it('reports a changed tool section with its name', () => {
    expect(change('[tool.ruff]\nline-length = 100\nignore = ["E501"]\n')).toEqual([
      {
        category: 'gate-tampering',
        kind: 'config-edit',
        path: 'pyproject.toml',
        detail: 'changed tool.ruff in pyproject.toml',
      },
    ]);
  });

  it.each([
    ['[tool.mypy]\nstrict = false\n'],
    ['[tool.pyright]\ntypeCheckingMode = "off"\n'],
    ['[tool.basedpyright]\nreportAny = false\n'],
    ['[tool.coverage.report]\nfail_under = 0\n'],
    ['[tool.mutmut]\npaths_to_mutate = []\n'],
    ['[tool.importlinter]\nroot_package = "demo"\n'],
  ])('reports an added section: %s', (section) => {
    expect(change(`[tool.ruff]\nline-length = 100\n\n${section}`)).toHaveLength(1);
  });

  it('reports a loosened pytest addopts', () => {
    expect(change('addopts = "-p no:cacheprovider"', 'addopts = "--strict-markers"')).toMatchObject(
      [{ detail: 'changed tool.pytest in pyproject.toml' }],
    );
  });

  it('reports a removed tool section', () => {
    expect(change('', '[tool.ruff]\nline-length = 100\n')).toHaveLength(1);
  });

  it('ignores a reformatted section, a dependency, a version bump and a registered marker', () => {
    expect(change('[tool.ruff]\n# note\nline-length=100\n')).toEqual([]);
    expect(change('dependencies = ["requests"]', 'dependencies = []')).toEqual([]);
    expect(change('version = "0.2.0"', 'version = "0.1.0"')).toEqual([]);
    expect(
      change(
        'addopts = "--strict-markers"\nmarkers = ["integration: slow"]',
        'addopts = "--strict-markers"',
      ),
    ).toEqual([]);
  });

  it('reports a pyproject.toml it cannot parse', () => {
    expect(
      detect({ 'pyproject.toml': PYPROJECT }, { 'pyproject.toml': '[tool.ruff\nbroken' }),
    ).toMatchObject([{ detail: 'changed unparseable file in pyproject.toml' }]);
  });
});

describe('setup.cfg and tox.ini', () => {
  const cfg =
    '[metadata]\nname = demo\n\n[mypy]\nstrict = True\n\n[flake8]\nmax-line-length = 100\n';

  it('reports a changed tool section and ignores the metadata and comments', () => {
    expect(
      detect({ 'setup.cfg': cfg }, { 'setup.cfg': cfg.replace('strict = True', 'strict = False') }),
    ).toMatchObject([{ detail: 'changed mypy in setup.cfg' }]);
    expect(
      detect(
        { 'setup.cfg': cfg },
        { 'setup.cfg': cfg.replace('name = demo', '# c\nname = other') },
      ),
    ).toEqual([]);
  });

  it('reports a new coverage section in tox.ini', () => {
    expect(
      detect(
        { 'tox.ini': '[tox]\nenvlist = py\n' },
        { 'tox.ini': '[tox]\nenvlist = py\n[coverage:report]\nfail_under = 0\n' },
      ),
    ).toMatchObject([{ detail: 'changed coverage:report in tox.ini' }]);
  });
});

describe('Java and Kotlin tool files', () => {
  it.each([
    'detekt.yml',
    'config/detekt/detekt.yml',
    'detekt-baseline.yml',
    'config/pmd/ruleset.xml',
    'config/checkstyle/checkstyle.xml',
    'config/checkstyle/suppressions.xml',
    'config/spotbugs/exclude.xml',
    'checkstyle.xml',
    'pmd-ruleset.xml',
    'detekt-baseline.xml',
    'archunit.properties',
  ])('reports %s', (file) => {
    expect(edits(detect({ [file]: 'a' }, { [file]: 'b' }))).toEqual([`config-edit ${file}`]);
  });

  it('reports only the ktlint and line-length keys of an .editorconfig', () => {
    const file = '.editorconfig';
    const base = '[*.kt]\nindent_size = 4\nktlint_standard_no-wildcard-imports = enabled\n';
    const with_ = (text) => edits(detect({ [file]: base }, { [file]: text }));
    expect(with_(base.replace('= 4', '= 2'))).toEqual([]);
    expect(with_(base.replace('enabled', 'disabled'))).toEqual(['config-edit .editorconfig']);
    expect(with_(`${base}max_line_length = off\n`)).toEqual(['config-edit .editorconfig']);
  });

  it('does not report source files, resources or the settings files', () => {
    const files = {
      'src/main/java/A.java': 'a',
      'src/main/resources/application.yml': 'a',
      'settings.gradle': 'a',
      'README.md': 'a',
    };
    expect(
      detect(files, Object.fromEntries(Object.keys(files).map((file) => [file, 'b']))),
    ).toEqual([]);
  });
});
