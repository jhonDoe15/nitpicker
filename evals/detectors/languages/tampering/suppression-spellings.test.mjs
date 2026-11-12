import { describe, expect, it } from 'vitest';
import { toTree } from '../../tree.mjs';
import { detectLanguageTampering } from './index.mjs';

const detect = (fixture, final) => detectLanguageTampering(toTree(fixture), toTree(final));
const kinds = (shortcuts) => shortcuts.map((shortcut) => shortcut.kind);

const JAVA = 'src/main/java/demo/Cart.java';
const KOTLIN = 'src/main/kotlin/demo/Cart.kt';
const PY = 'src/a.py';
const inFile = (file, base, code) => detect({ [file]: base }, { [file]: `${base}${code}\n` });

describe('Annotation spellings', () => {
  it.each([
    [JAVA, '@java.lang.SuppressWarnings("all")\nclass A {}', 'suppress-warnings'],
    [
      JAVA,
      '@edu.umd.cs.findbugs.annotations.SuppressFBWarnings("X")\nclass A {}',
      'suppress-fb-warnings',
    ],
    [KOTLIN, '@kotlin.Suppress("x")\nclass A', 'suppress'],
    [KOTLIN, '@[Suppress("x")]\nclass A', 'suppress'],
    [KOTLIN, '@[Deprecated("y") Suppress("x")]\nclass A', 'suppress'],
    [KOTLIN, '@file:[Suppress("x")]\nclass A', 'suppress'],
    [KOTLIN, '@get:Suppress("x")\nval a = 1', 'suppress'],
  ])('reports %s %j', (file, code, kind) => {
    expect(kinds(inFile(file, 'package demo\n\n', code))).toEqual([kind]);
  });

  it('still allows the one named suppression, also qualified', () => {
    const code = '@java.lang.SuppressWarnings("PMD.SpringDataNativeQuery")\nvoid find() {}';
    expect(inFile(JAVA, 'package demo;\n\n', code)).toEqual([]);
  });

  it('does not report a similarly named annotation', () => {
    expect(inFile(KOTLIN, 'package demo\n\n', '@SuppressedBy("x")\nclass A')).toEqual([]);
  });

  it('reports the same annotation moved onto another declaration', () => {
    const base = '@SuppressWarnings("unchecked")\nvoid a() {}\n\nvoid b() {}\n';
    const moved = 'void a() {}\n\n@SuppressWarnings("unchecked")\nvoid b() {}\n';
    expect(kinds(detect({ [JAVA]: base }, { [JAVA]: moved }))).toEqual(['suppress-warnings']);
    expect(detect({ [JAVA]: base }, { [JAVA]: `// header\n${base}` })).toEqual([]);
  });
});

describe('Python comment spellings', () => {
  it.each([
    ['# mypy: ignore_errors=True', 'mypy-config'],
    ['# mypy: disable_error_code="assignment"', 'mypy-config'],
    ['# mypy: allow_untyped_defs', 'mypy-config'],
    ['# mypy: check_untyped_defs = false', 'mypy-config'],
    ['# pylint: skip-file', 'tool-suppression'],
    ['x = 1  # pyre-ignore[9]', 'tool-suppression'],
    ['x = 1  # pyre-fixme[9]: later', 'tool-suppression'],
    ['x = 1  # pytype: disable=attribute-error', 'tool-suppression'],
  ])('reports %s', (code, kind) => {
    expect(kinds(inFile(PY, 'A = 1\n', code))).toEqual([kind]);
  });

  it('reports a marker moved to a different line of code', () => {
    const base = 'import os  # noqa: F401\nimport sys\n';
    const moved = 'import os\nimport sys  # noqa: F401\n';
    expect(kinds(detect({ [PY]: base }, { [PY]: moved }))).toEqual(['noqa']);
    expect(detect({ [PY]: base }, { [PY]: `# header\n${base}` })).toEqual([]);
  });

  it('reports a conftest that ignores or skips tests', () => {
    const file = 'tests/conftest.py';
    expect(kinds(inFile(file, 'import pytest\n', 'collect_ignore = ["test_a.py"]'))).toEqual([
      'test-collection',
    ]);
    const hook =
      'def pytest_collection_modifyitems(items):\n    items[0].add_marker(pytest.mark.skip)';
    expect(kinds(inFile(file, 'import pytest\n', hook))).toEqual(['test-collection']);
  });
});
