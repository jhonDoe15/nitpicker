import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pytestStyle, pytestStyleFlags } from './pytest-style.mjs';

const roots = [];

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pytest-style-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const parenthesized = [
  'import pytest',
  '',
  '',
  '@pytest.fixture()',
  'def a():',
  '    return 1',
  '',
  '',
  '@pytest.fixture()',
  'def b():',
  '    return 2',
  '',
  '',
  '@pytest.fixture',
  'def c():',
  '    return 3',
  '',
  '',
  '@pytest.mark.slow()',
  '@pytest.mark.parametrize("a,b,expected", [(1, 2, 3), (2, 3, 5)])',
  'def test_a(a, b, expected):',
  '    assert a + b == expected',
  '',
  '',
  '@pytest.mark.parametrize("a,b", [(1, 2)])',
  'def test_b(a, b):',
  '    assert a < b',
  '',
].join('\n');

describe('the pytest style of a project', () => {
  it('follows the majority of its fixtures, marks and parametrize calls', () => {
    const root = project({ 'tests/test_a.py': parenthesized });

    expect(pytestStyle(root, ['tests/test_a.py'])).toEqual({
      'fixture-parentheses': true,
      'mark-parentheses': true,
      'parametrize-names-type': 'csv',
      'parametrize-values-type': 'list',
      'parametrize-values-row-type': 'tuple',
    });
  });

  it('measures tuples, lists and bare decorators', () => {
    const text = [
      '@pytest.fixture',
      'def a(): ...',
      '@pytest.mark.slow',
      '@pytest.mark.parametrize(("a", "b"), ([1, 2], [2, 3]))',
      'def test_a(a, b): ...',
    ].join('\n');
    const root = project({ 'tests/test_a.py': text });

    expect(pytestStyle(root, ['tests/test_a.py'])).toEqual({
      'fixture-parentheses': false,
      'mark-parentheses': false,
      'parametrize-names-type': 'tuple',
      'parametrize-values-type': 'tuple',
      'parametrize-values-row-type': 'list',
    });
  });

  it('says nothing when the code gives no evidence or a tie', () => {
    const root = project({
      'tests/test_a.py': '@pytest.fixture()\ndef a(): ...\n\n@pytest.fixture\ndef b(): ...\n',
    });

    expect(pytestStyle(root, ['tests/test_a.py'])).toEqual({});
  });

  it('prefers what the ruff configuration of the project sets', () => {
    const root = project({
      'tests/test_a.py': parenthesized,
      'pyproject.toml':
        '[tool.ruff.lint.flake8-pytest-style]\nfixture-parentheses = false\nparametrize-names-type = "tuple"\n',
    });

    expect(pytestStyle(root, ['tests/test_a.py'])).toEqual({
      'fixture-parentheses': false,
      'parametrize-names-type': 'tuple',
      'mark-parentheses': true,
      'parametrize-values-type': 'list',
      'parametrize-values-row-type': 'tuple',
    });
  });

  it('reads the set options from the config root and measures the checked code', () => {
    const head = project({
      'pyproject.toml': '[tool.ruff.lint.flake8-pytest-style]\nfixture-parentheses = false\n',
    });
    const base = project({
      'tests/test_a.py': parenthesized,
      'pyproject.toml': '[tool.ruff.lint.flake8-pytest-style]\nfixture-parentheses = true\n',
    });

    expect(pytestStyle(base, ['tests/test_a.py'], head)).toMatchObject({
      'fixture-parentheses': false,
      'mark-parentheses': true,
    });
  });

  it('turns the choices into ruff config flags', () => {
    expect(
      pytestStyleFlags({ 'fixture-parentheses': true, 'parametrize-names-type': 'csv' }),
    ).toEqual([
      '--config',
      'lint.flake8-pytest-style.fixture-parentheses = true',
      '--config',
      'lint.flake8-pytest-style.parametrize-names-type = "csv"',
    ]);
  });
});
