import { describe, expect, it } from 'vitest';
import { addDependency, addRaw, declaredEntries } from './pyproject-layout.mjs';
import { removeFromArray, removeKeyLines } from './toml-edits.mjs';
import { arrayElements, scanToml } from './toml-scan.mjs';

function applied(text, edit) {
  return text.slice(0, edit.start) + edit.text + text.slice(edit.end);
}

const PEP621 = `[project]
name = "demo"
dependencies = [
    "requests>=2",  # http
    "click",
]

[dependency-groups]
dev = [
    "pytest>=8",
]
`;

const POETRY = `[tool.poetry]
name = "demo"

[tool.poetry.dependencies]
python = "^3.11"
requests = "^2.31"

[tool.poetry.group.dev.dependencies]
pytest = "^8.0"
`;

describe('scanToml', () => {
  it('finds sections and keys, and reads arrays with strings that hold brackets', () => {
    const text = 'a = 1\n[x.y]\nk = ["a[b]>=1", \'c\'] # note\n[[z]]\nm = [\n  "q",\n]\n';

    const sections = scanToml(text);

    expect(sections.map(({ name, keys }) => [name, keys.map(({ key }) => key)])).toEqual([
      ['', ['a']],
      ['x.y', ['k']],
      ['z', ['m']],
    ]);
    expect(arrayElements(text, sections[1].keys[0]).elements.map(({ value }) => value)).toEqual([
      'a[b]>=1',
      'c',
    ]);
    expect(arrayElements(text, sections[2].keys[0]).elements).toHaveLength(1);
  });

  it('declines an array that holds anything but strings', () => {
    const [, section] = scanToml('[g]\nd = [{ include-group = "x" }]\n');

    expect(arrayElements('[g]\nd = [{ include-group = "x" }]\n', section.keys[0])).toBeUndefined();
  });
});

describe('declaredEntries', () => {
  it('lists PEP 621, uv group and Poetry declarations with their group', () => {
    expect(
      declaredEntries(PEP621).map(({ normalized, group, kind }) => [normalized, group, kind]),
    ).toEqual([
      ['requests', 'production', 'array'],
      ['click', 'production', 'array'],
      ['pytest', 'dev', 'array'],
    ]);
    expect(
      declaredEntries(POETRY).map(({ normalized, group, kind }) => [normalized, group, kind]),
    ).toEqual([
      ['requests', 'production', 'table'],
      ['pytest', 'dev', 'table'],
    ]);
  });
});

describe('addDependency', () => {
  it('appends to a multi-line project array, after a trailing comma, keeping the indent', () => {
    const edit = addDependency(PEP621, { name: 'httpx', version: '0.27.0', development: false });

    expect(applied(PEP621, edit)).toBe(
      PEP621.replace('    "click",\n', '    "click",\n    "httpx>=0.27.0",\n'),
    );
  });

  it('adds the missing comma and keeps a comment on the last line', () => {
    const text = 'dependencies = [\n    "a",  # first\n    "b"  # last\n]\n';
    const [section] = scanToml(text);
    const edit = addDependency(`[project]\n${text}`, {
      name: 'c',
      version: '1',
      development: false,
    });

    expect(applied(`[project]\n${text}`, edit)).toBe(
      '[project]\ndependencies = [\n    "a",  # first\n    "b",  # last\n    "c>=1"\n]\n',
    );
    expect(section.keys).toHaveLength(1);
  });

  it('appends inside a one-line array and fills an empty one', () => {
    const one = '[project]\ndependencies = ["a"]\n';
    const none = '[project]\ndependencies = []\n';

    expect(applied(one, addDependency(one, { name: 'b', version: '2', development: false }))).toBe(
      '[project]\ndependencies = ["a", "b>=2"]\n',
    );
    expect(
      applied(none, addDependency(none, { name: 'b', version: '2', development: false })),
    ).toBe('[project]\ndependencies = ["b>=2"]\n');
  });

  it('adds a development dependency to the uv dependency group', () => {
    const edit = addDependency(PEP621, { name: 'respx', version: '0.21', development: true });

    expect(applied(PEP621, edit)).toBe(
      PEP621.replace('    "pytest>=8",\n', '    "pytest>=8",\n    "respx>=0.21",\n'),
    );
  });

  it('adds a Poetry entry at the end of its table, and to the dev table for tests', () => {
    const production = addDependency(POETRY, {
      name: 'httpx',
      version: '0.27',
      development: false,
    });
    const development = addDependency(POETRY, {
      name: 'respx',
      version: '0.21',
      development: true,
    });

    expect(applied(POETRY, production)).toBe(
      POETRY.replace('requests = "^2.31"\n', 'requests = "^2.31"\nhttpx = ">=0.27"\n'),
    );
    expect(applied(POETRY, development).endsWith('pytest = "^8.0"\nrespx = ">=0.21"\n')).toBe(true);
  });

  it('keeps CRLF line endings and declines a file with no dependency list', () => {
    const crlf = PEP621.replaceAll('\n', '\r\n');

    expect(
      applied(crlf, addDependency(crlf, { name: 'x', version: '1', development: false })),
    ).toBe(crlf.replace('    "click",\r\n', '    "click",\r\n    "x>=1",\r\n'));
    expect(
      addDependency('[tool.other]\nx = 1\n', { name: 'x', version: '1', development: false }),
    ).toBeUndefined();
  });
});

describe('removals and moves', () => {
  it('removes an element on its own line with its comment, and one in a one-line array', () => {
    const [first] = declaredEntries(PEP621);
    const inline = '[project]\ndependencies = ["a", "b", "c"]\n';
    const [, middle] = declaredEntries(inline);
    const [last] = declaredEntries(inline).slice(-1);

    expect(applied(PEP621, removeFromArray(PEP621, first.key, first.index))).toBe(
      PEP621.replace('    "requests>=2",  # http\n', ''),
    );
    expect(applied(inline, removeFromArray(inline, middle.key, middle.index))).toBe(
      '[project]\ndependencies = ["a", "c"]\n',
    );
    expect(applied(inline, removeFromArray(inline, last.key, last.index))).toBe(
      '[project]\ndependencies = ["a", "b"]\n',
    );
  });

  it('removes a Poetry entry line', () => {
    const [requests] = declaredEntries(POETRY);

    expect(applied(POETRY, removeKeyLines(requests.key))).toBe(
      POETRY.replace('requests = "^2.31"\n', ''),
    );
  });

  it('moves a development entry to the production list as it was written', () => {
    const dev = declaredEntries(PEP621).find(({ group }) => group === 'dev');

    expect(applied(PEP621, addRaw(PEP621, dev))).toBe(
      PEP621.replace('    "click",\n', '    "click",\n    "pytest>=8",\n'),
    );
    expect(addRaw('[tool.other]\n', dev)).toBeUndefined();
  });
});
