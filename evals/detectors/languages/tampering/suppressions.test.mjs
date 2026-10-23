import { describe, expect, it } from 'vitest';
import { toTree } from '../../tree.mjs';
import { detectLanguageTampering } from './index.mjs';

const detect = (fixture, final) => detectLanguageTampering(toTree(fixture), toTree(final));
const kinds = (shortcuts) => shortcuts.map((shortcut) => shortcut.kind);
const details = (shortcuts) => shortcuts.map((shortcut) => shortcut.detail);

describe('Python suppressions', () => {
  const fixture = { 'src/a.py': 'A = 1\n' };
  const added = (code) => detect(fixture, { 'src/a.py': `A = 1\n${code}\n` });

  it('reports a noqa with its line and text', () => {
    expect(added('B = 2  # noqa: E501')).toEqual([
      {
        category: 'gate-tampering',
        kind: 'noqa',
        path: 'src/a.py',
        line: 2,
        detail: 'noqa: E501',
      },
    ]);
  });

  it.each([
    ['# noqa', 'noqa'],
    ['# ruff: noqa: F401', 'noqa'],
    ['# flake8: noqa', 'noqa'],
    ['x = 1  # type: ignore[assignment]', 'type-ignore'],
    ['x = 1  # pyright: ignore[reportAssignmentType]', 'pyright-ignore'],
    ['# pyright: basic', 'pyright-ignore'],
    ['# pyright: reportGeneralTypeIssues=false', 'pyright-ignore'],
    ['# mypy: ignore-errors', 'mypy-config'],
    ['if x:  # pragma: no cover', 'pragma-no-cover'],
    ['if x:  # pragma: no branch', 'pragma-no-cover'],
    ['y = 2  # pragma: no mutate', 'pragma-no-mutate'],
    ['# fmt: off', 'fmt-off'],
    ['y = [1,2]  # fmt: skip', 'fmt-off'],
    ['# pylint: disable=unused-import', 'tool-suppression'],
    ['y = 2  # nosec', 'tool-suppression'],
    ['@no_type_check\ndef f(): ...', 'no-type-check'],
    ['@typing.no_type_check\ndef f(): ...', 'no-type-check'],
  ])('reports %s as %s', (code, kind) => {
    expect(kinds(added(code))).toEqual([kind]);
  });

  it('reports each marker of a comment that carries several', () => {
    expect(kinds(added('x = 1  # type: ignore  # noqa: E501'))).toEqual(['noqa', 'type-ignore']);
  });

  it('ignores markers inside strings and docstrings, and prose that merely mentions them', () => {
    const code = 's = "# noqa"\n"""\n# type: ignore\n"""\n# see the noqa docs\n# a fmt: off switch';
    expect(added(code)).toEqual([]);
  });

  it('does not report a marker the fixture already has, but reports a second copy', () => {
    const known = { 'src/a.py': 'A = 1  # noqa: E501\n' };
    expect(detect(known, { 'src/a.py': '\n\nA = 1  # noqa: E501\n' })).toEqual([]);
    expect(
      kinds(detect(known, { 'src/a.py': 'A = 1  # noqa: E501\nB = 2  # noqa: E501\n' })),
    ).toEqual(['noqa']);
  });

  it('reports a marker in a new file', () => {
    expect(kinds(detect({}, { 'src/new.py': 'x = 1  # type: ignore\n' }))).toEqual(['type-ignore']);
  });
});

describe('Java suppressions', () => {
  const fixture = { 'src/main/java/A.java': 'class A {}\n' };
  const added = (code) => detect(fixture, { 'src/main/java/A.java': `class A {}\n${code}\n` });

  it.each([
    [
      '@SuppressWarnings("unchecked")\nclass B {}',
      'suppress-warnings',
      '@SuppressWarnings("unchecked")',
    ],
    [
      '@SuppressWarnings({"PMD.Foo",\n  "rawtypes"})\nclass B {}',
      'suppress-warnings',
      '@SuppressWarnings({"PMD.Foo", "rawtypes"})',
    ],
    [
      '@SuppressFBWarnings("EI_EXPOSE_REP")\nclass B {}',
      'suppress-fb-warnings',
      '@SuppressFBWarnings("EI_EXPOSE_REP")',
    ],
    ['@NullUnmarked\nclass B {}', 'null-unmarked', '@NullUnmarked'],
    ['int x = 1; // NOPMD - reviewed', 'nopmd', 'NOPMD - reviewed'],
    [
      '// CHECKSTYLE.OFF: MagicNumber\nint x = 7;',
      'checkstyle-suppression',
      'CHECKSTYLE.OFF: MagicNumber',
    ],
    ['/* CHECKSTYLE:SUPPRESS */ int x = 7;', 'checkstyle-suppression', 'CHECKSTYLE:SUPPRESS'],
    ['// @formatter:off\nint[] x = {1,2};', 'fmt-off', '@formatter:off'],
  ])('reports %s', (code, kind, detail) => {
    expect(added(code)).toMatchObject([{ kind, detail, path: 'src/main/java/A.java' }]);
  });

  it('allows the one suppression the preset names, for native SQL on a repository method', () => {
    expect(added('@SuppressWarnings("PMD.SpringDataNativeQuery")\nclass B {}')).toEqual([]);
    expect(kinds(added('@SuppressWarnings("PMD.SpringDataNativeQuery", "x")\nclass B {}'))).toEqual(
      ['suppress-warnings'],
    );
  });

  it('ignores the names in strings and comments that are not markers', () => {
    const code =
      'String s = "@SuppressWarnings(\\"x\\") // NOPMD";\n/** Uses {@code @NullUnmarked}. */';
    expect(added(code)).toEqual([]);
  });

  it('does not report a suppression the fixture already has', () => {
    const known = { 'src/main/java/A.java': '@SuppressWarnings("unchecked")\nclass A {}\n' };
    const final = {
      'src/main/java/A.java': '// moved\n@SuppressWarnings("unchecked")\nclass A {}\n',
    };
    expect(detect(known, final)).toEqual([]);
  });

  it('reports the details of every added suppression in a changed file', () => {
    expect(details(added('class B { @SuppressWarnings("a") void f() {} // NOPMD\n}'))).toEqual([
      'NOPMD',
      '@SuppressWarnings("a")',
    ]);
  });
});

describe('Kotlin suppressions', () => {
  const fixture = { 'src/main/kotlin/A.kt': 'class A\n' };
  const added = (code) => detect(fixture, { 'src/main/kotlin/A.kt': `class A\n${code}\n` });

  it.each([
    ['@Suppress("MagicNumber")\nclass B', 'suppress', '@Suppress("MagicNumber")'],
    ['@file:Suppress("detekt:all")', 'suppress', '@file:Suppress("detekt:all")'],
    ['@get:Suppress("x")\nval y = 1', 'suppress', '@get:Suppress("x")'],
    [
      'val x = 1 // ktlint-disable no-wildcard-imports',
      'ktlint-disable',
      'ktlint-disable no-wildcard-imports',
    ],
    ['/* ktlint-disable */\nval x = 1', 'ktlint-disable', 'ktlint-disable'],
    [
      '@SuppressWarnings("unchecked")\nclass B',
      'suppress-warnings',
      '@SuppressWarnings("unchecked")',
    ],
    ['val x = 1 // NOPMD', 'nopmd', 'NOPMD'],
  ])('reports %s', (code, kind, detail) => {
    expect(added(code)).toMatchObject([{ kind, detail }]);
  });

  it('ignores a string that spells a suppression, including inside a template', () => {
    const code = 'val s = "@Suppress(\\"x\\") ${"// ktlint-disable"}"';
    expect(added(code)).toEqual([]);
  });
});
