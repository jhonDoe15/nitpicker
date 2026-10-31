import { describe, expect, it } from 'vitest';
import { toTree } from '../../tree.mjs';
import { detectLanguageWeakenedTests } from './weakened.mjs';

const detect = (fixture, final) => detectLanguageWeakenedTests(toTree(fixture), toTree(final));
const kinds = (shortcuts) => shortcuts.map((shortcut) => shortcut.kind);

const PY = 'tests/test_cart.py';
const py = (...tests) => ({ [PY]: `import pytest\n\n\n${tests.join('\n\n')}\n` });
const SUM = 'def test_sum():\n    result = total([1, 2])\n    assert result == 3\n';

describe('Python tests an honest edit changes', () => {
  it('does not report an added not-None check, but reports one that replaces a value check', () => {
    const narrowed = SUM.replace(
      '    assert result == 3',
      '    assert result is not None\n    assert result == 3',
    );
    expect(detect(py(SUM), py(narrowed))).toEqual([]);
    const replaced = SUM.replace('assert result == 3', 'assert result is not None');
    expect(kinds(detect(py(SUM), py(replaced)))).toEqual(['weakened-assertion']);
  });

  it('does not take a decorator that only starts with skip for a skip', () => {
    const decorated = `@skip_none\n${SUM}`;
    expect(detect(py(SUM), py(decorated))).toEqual([]);
    expect(kinds(detect(py(SUM), py(`@pytest.mark.skip\n${SUM}`)))).toEqual(['skipped-test']);
    expect(kinds(detect(py(SUM), py(`@mark.skipif(True, reason="x")\n${SUM}`)))).toEqual([
      'skipped-test',
    ]);
  });

  it('reports a module or test turned off by importorskip', () => {
    expect(
      kinds(detect(py(SUM), py(SUM.replace('result =', 'pytest.importorskip("x")\n    result =')))),
    ).toEqual(['skipped-test']);
    const module = { [PY]: `import pytest\n\npytest.importorskip("numpy")\n\n\n${SUM}` };
    expect(kinds(detect(py(SUM), module))).toEqual(['skipped-test']);
  });

  it('reports a shrunk parametrize list', () => {
    const cases = (...rows) =>
      `@pytest.mark.parametrize("n", [${rows.join(', ')}])\ndef test_n(n):\n    assert n > 0\n`;
    expect(kinds(detect(py(cases(1, 2, 3)), py(cases(1, 2))))).toEqual(['deleted-test']);
    expect(detect(py(cases(1, 2)), py(cases(1, 2, 3)))).toEqual([]);
    const stacked = '@pytest.mark.parametrize("m", [1, 2])\n';
    expect(kinds(detect(py(stacked + cases(1, 2)), py(cases(1, 2))))).toEqual(['deleted-test']);
  });

  it('reports a new test without assertions and one with only a tautology', () => {
    expect(kinds(detect(py(SUM), py(SUM, 'def test_new():\n    total([1])\n')))).toEqual([
      'assertion-free-test',
    ]);
    expect(
      kinds(detect(py(SUM), py(SUM, 'def test_new():\n    assert total([1]) == total([1])\n'))),
    ).toEqual(['always-passing-assertion']);
    expect(
      detect(
        py(SUM),
        py(SUM, 'def test_new():\n    with pytest.raises(ValueError):\n        total(None)\n'),
      ),
    ).toEqual([]);
  });

  it('reads a test whose parameter list spans lines', () => {
    const wide =
      'def test_wide(\n    first: int,\n    second: int,\n) -> None:\n    assert first < second\n';
    expect(detect(py(SUM), py(SUM, wide))).toEqual([]);
    expect(
      kinds(detect(py(wide), py(wide.replace('    assert first < second\n', '    pass\n')))),
    ).toEqual(['removed-assertion']);
  });

  it.each([
    'assert total([1]) == 1 or True',
    'assert (total([1]) == 1, "message")',
    'try:\n        assert total([1]) == 1\n    except AssertionError:\n        pass',
  ])('reports an assertion that cannot fail: %s', (body) => {
    const test = SUM.replace('assert result == 3', body);
    expect(kinds(detect(py(SUM), py(test)))).toContain('always-passing-assertion');
  });
});

const JAVA = 'src/test/java/demo/CartTest.java';
const GRADLE = { 'build.gradle': 'test {\n    useJUnitPlatform()\n}\n' };
const java = (...members) => ({
  ...GRADLE,
  [JAVA]: `package demo;\nimport org.junit.jupiter.api.Test;\n\nclass CartTest {\n${members.join('\n')}\n}\n`,
});
const SUMS =
  '    @Test\n    void sums() {\n        var cart = new Cart();\n        assertEquals(3, cart.sum(1, 2));\n    }\n';

describe('JUnit tests an honest edit changes', () => {
  it('does not report an added assertNotNull, but reports one that replaces an equality', () => {
    const narrowed = SUMS.replace(
      '        assertEquals',
      '        assertNotNull(cart);\n        assertEquals',
    );
    expect(detect(java(SUMS), java(narrowed))).toEqual([]);
    const replaced = SUMS.replace('assertEquals(3, cart.sum(1, 2))', 'assertNotNull(cart)');
    expect(kinds(detect(java(SUMS), java(replaced)))).toEqual(['weakened-assertion']);
  });

  it('does not count a test named shouldSum as asserting', () => {
    const named = SUMS.replace('void sums()', 'void shouldSum()');
    const dropped = named.replace('        assertEquals(3, cart.sum(1, 2));\n', '');
    expect(detect(java(named), java(dropped))).toMatchObject([
      { kind: 'removed-assertion', detail: expect.stringContaining('assertions 1 -> 0') },
    ]);
  });

  it.each([
    ['assumeTrue of a call', SUMS.replace('var cart', 'assumeTrue(isLinux());\n        var cart')],
    ['@EnabledOnOs', SUMS.replace('@Test', '@Test\n    @EnabledOnOs(OS.LINUX)')],
    [
      '@EnabledIfEnvironmentVariable',
      SUMS.replace(
        '@Test',
        '@Test\n    @EnabledIfEnvironmentVariable(named = "CI", matches = "1")',
      ),
    ],
  ])('reports %s as a skip', (_name, changed) => {
    expect(kinds(detect(java(SUMS), java(changed)))).toEqual(['skipped-test']);
  });

  it('reports shrunk argument sources', () => {
    const csv = (...rows) =>
      `    @ParameterizedTest\n    @CsvSource({${rows.map((row) => `"${row}"`).join(', ')}})\n    void sums(int a, int b) {\n        assertEquals(a + b, Cart.sum(a, b));\n    }\n`;
    const source = (...values) =>
      `    @ParameterizedTest\n    @ValueSource(ints = {${values.join(', ')}})\n    void positive(int n) {\n        assertTrue(n > 0);\n    }\n`;
    expect(kinds(detect(java(csv('1,2', '3,4')), java(csv('1,2'))))).toEqual(['deleted-test']);
    expect(kinds(detect(java(source(1, 2, 3)), java(source(1))))).toEqual(['deleted-test']);
    expect(detect(java(csv('1,2')), java(csv('1,2', '3,4')))).toEqual([]);
  });

  it('reports tautologies and a new test without assertions', () => {
    const empty = '    @Test\n    void smoke() {\n        new Cart().total();\n    }\n';
    expect(kinds(detect(java(SUMS), java(SUMS, empty)))).toEqual(['assertion-free-test']);
    const same = '    @Test\n    void same() {\n        assertEquals(f(1), f(1));\n    }\n';
    expect(kinds(detect(java(SUMS), java(SUMS, same)))).toEqual(['always-passing-assertion']);
    const equal = '    @Test\n    void same() {\n        assertTrue(a == a);\n    }\n';
    expect(kinds(detect(java(SUMS), java(SUMS, equal)))).toEqual(['always-passing-assertion']);
  });

  it('survives an annotation list or a lone @ before the method', () => {
    const odd = SUMS.replace('@Test', '@Test @[Foo Bar]').replace('void sums', '@ void sums');
    expect(() => detect(java(SUMS), java(odd))).not.toThrow();
    const kotlin = {
      'src/test/kotlin/demo/CartTest.kt':
        'package demo\n\nclass CartTest {\n    @Test @[Foo Bar] fun a() { assertEquals(1, 1) }\n    @Test @ fun b() {}\n}\n',
    };
    expect(() => detect({}, kotlin)).not.toThrow();
  });
});
