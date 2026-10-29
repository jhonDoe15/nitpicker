import { describe, expect, it } from 'vitest';
import { toTree } from '../../tree.mjs';
import { detectLanguageWeakenedTests } from './weakened.mjs';

const detect = (fixture, final) =>
  detectLanguageWeakenedTests(toTree(fixture), toTree({ ...final }));
const kinds = (shortcuts) => shortcuts.map((shortcut) => shortcut.kind);

const PRICING = 'def discount(price):\n    return price\n\ndef tax(price):\n    return price\n';
const TESTS = `import pytest
from demo.pricing import discount, tax


def test_discount():
    assert discount(50) == 50
    assert discount(150) == 140


class TestTax:
    def test_rate(self):
        assert tax(100) == 120

    def test_zero(self):
        with pytest.raises(ValueError):
            tax(-1)
`;
const fixture = { 'src/demo/pricing.py': PRICING, 'tests/test_pricing.py': TESTS };
const withTests = (tests) => ({ ...fixture, 'tests/test_pricing.py': tests });
const inRate = (lines) => withTests(TESTS.replace('        assert tax(100) == 120', lines));

describe('deleted tests', () => {
  it('reports a removed function test and a removed method test with their keys', () => {
    const final = withTests(
      TESTS.replace(/def test_discount[\s\S]*?\n\n\n/u, '').replace(
        /\n {4}def test_zero[\s\S]*$/u,
        '\n',
      ),
    );
    expect(detect(fixture, final)).toEqual([
      {
        category: 'weakened-tests',
        kind: 'deleted-test',
        path: 'tests/test_pricing.py',
        line: 5,
        detail: 'test removed: test_discount',
      },
      {
        category: 'weakened-tests',
        kind: 'deleted-test',
        path: 'tests/test_pricing.py',
        line: 14,
        detail: 'test removed: TestTax.test_zero',
      },
    ]);
  });

  it('reports every test of a deleted test file', () => {
    expect(kinds(detect(fixture, { 'src/demo/pricing.py': PRICING }))).toEqual([
      'deleted-test',
      'deleted-test',
      'deleted-test',
    ]);
  });

  it('does not report a renamed test or one moved to another file', () => {
    expect(
      detect(fixture, withTests(TESTS.replace('test_discount', 'test_discount_tiers'))),
    ).toEqual([]);
    const moved = { 'src/demo/pricing.py': PRICING, 'tests/test_other.py': TESTS };
    expect(detect(fixture, moved)).toEqual([]);
  });

  it('does not report added tests', () => {
    expect(
      detect(fixture, withTests(`${TESTS}\n\ndef test_new():\n    assert tax(1) == 1\n`)),
    ).toEqual([]);
  });
});

describe('skipped tests', () => {
  it.each([
    ['@pytest.mark.skip', '@pytest.mark.skip(reason="later")\ndef test_discount():'],
    ['@pytest.mark.skipif', '@pytest.mark.skipif(True, reason="x")\ndef test_discount():'],
    ['@pytest.mark.xfail', '@pytest.mark.xfail\ndef test_discount():'],
    ['@unittest.skip', '@unittest.skip("x")\ndef test_discount():'],
    [
      'a decorator on a multi-line argument list',
      '@pytest.mark.skipif(\n    True,\n    reason="x",\n)\ndef test_discount():',
    ],
    ['pytest.skip() in the body', 'def test_discount():\n    pytest.skip("later")'],
    ['self.skipTest in the body', 'def test_discount():\n    self.skipTest("later")'],
  ])('reports %s', (_name, replacement) => {
    const final = withTests(TESTS.replace('def test_discount():', replacement));
    expect(kinds(detect(fixture, final))).toEqual(['skipped-test']);
  });

  it('reports a skipped class and a module-level pytestmark', () => {
    const skippedClass = TESTS.replace('class TestTax:', '@pytest.mark.skip\nclass TestTax:');
    expect(detect(fixture, withTests(skippedClass)).map((shortcut) => shortcut.detail)).toEqual([
      'test skipped: TestTax.test_rate',
      'test skipped: TestTax.test_zero',
    ]);
    const marked = TESTS.replace(
      '\n\n\ndef test_discount',
      '\npytestmark = pytest.mark.skip\n\n\ndef test_discount',
    );
    expect(kinds(detect(fixture, withTests(marked)))).toEqual([
      'skipped-test',
      'skipped-test',
      'skipped-test',
    ]);
  });

  it('reports a new test that is born skipped, and ignores a skip that was already there', () => {
    const born = `${TESTS}\n\n@pytest.mark.skip\ndef test_new():\n    assert tax(1) == 1\n`;
    expect(detect(fixture, withTests(born))).toMatchObject([
      { kind: 'skipped-test', detail: 'new test is skipped: test_new' },
    ]);
    expect(detect({ ...fixture, 'tests/test_pricing.py': born }, withTests(born))).toEqual([]);
  });
});

describe('weaker assertions', () => {
  it('reports fewer assertions in a test', () => {
    const final = withTests(TESTS.replace('    assert discount(150) == 140\n', ''));
    expect(detect(fixture, final)).toMatchObject([
      { kind: 'removed-assertion', detail: 'test_discount: assertions 2 -> 1' },
    ]);
  });

  it('counts self.assert methods, pytest.raises and mock assertions', () => {
    const base = `class T(TestCase):
    def test_a(self):
        self.assertEqual(f(), 1)
        self.assertRaises(ValueError, g)
        m.assert_called_once_with(1)
        with pytest.raises(KeyError):
            h()
`;
    const stripped = base
      .replace('        self.assertEqual(f(), 1)\n', '')
      .replace('        m.assert_called_once_with(1)\n', '');
    expect(detect({ 'tests/test_a.py': base }, { 'tests/test_a.py': stripped })).toMatchObject([
      { kind: 'removed-assertion', detail: 'T.test_a: assertions 4 -> 2' },
    ]);
  });

  it('reports a test that keeps its call but loses every assertion', () => {
    expect(kinds(detect(fixture, inRate('        tax(100)')))).toEqual(['removed-assertion']);
  });

  it.each([
    ['assert True', '        assert True'],
    ['assert 1', '        assert 1'],
    ['assert not False', '        assert not False'],
    ['assert x == x', '        assert result == result'],
    ['assertTrue(True)', '        self.assertTrue(True)'],
  ])('reports the tautology %s in a test', (_name, line) => {
    const final = inRate(`        result = tax(100)\n${line}`);
    expect(detect(fixture, final)).toMatchObject([
      { kind: 'always-passing-assertion', detail: expect.stringContaining('TestTax.test_rate') },
    ]);
  });

  it.each([
    ['is not None', '        assert tax(100) is not None'],
    ['truthiness', '        result = tax(100)\n        assert result'],
    ['assertIsNotNone', '        self.assertIsNotNone(tax(100))'],
  ])('reports an equality assertion loosened to %s', (_name, line) => {
    expect(kinds(detect(fixture, inRate(line)))).toEqual(['weakened-assertion']);
  });

  it('does not report a test that gained assertions', () => {
    expect(
      detect(fixture, inRate('        assert tax(100) == 120\n        assert tax(0) == 0')),
    ).toEqual([]);
  });

  it('ignores assert in strings and comments', () => {
    const body = '        # assert True\n        assert tax(100) == 120 or "assert True"';
    expect(detect(fixture, inRate(body))).toEqual([]);
  });
});

describe('mocking the subject', () => {
  const withMock = (mock) =>
    withTests(TESTS.replace('def test_discount():', `${mock}\ndef test_discount():`));

  it.each([
    [
      'patching a function of the module',
      '@patch("demo.pricing.discount")',
      'demo.pricing.discount',
    ],
    ['patching the module', '@mock.patch("demo.pricing")', 'demo.pricing'],
    ['patch.object on the module', '@patch.object(pricing, "discount")', 'pricing.discount'],
    [
      'monkeypatch.setattr by name',
      '@pytest.fixture\ndef fake(monkeypatch):\n    monkeypatch.setattr("demo.pricing.tax", lambda p: p)\n',
      'demo.pricing.tax',
    ],
  ])('reports %s', (_name, mock, target) => {
    expect(detect(fixture, withMock(mock))).toMatchObject([
      { kind: 'mocked-subject', detail: `module under test is mocked: ${target}` },
    ]);
  });

  it('does not report patching what the module imported, or an unrelated module', () => {
    expect(detect(fixture, withMock('@patch("demo.pricing.requests.get")'))).toEqual([]);
    expect(detect(fixture, withMock('@patch("demo.other.discount")'))).toEqual([]);
    expect(detect(fixture, withMock('@patch.object(requests, "get")'))).toEqual([]);
  });

  it('does not report a mock the fixture already had', () => {
    const mocked = withMock('@patch("demo.pricing.discount")');
    expect(detect(mocked, mocked)).toEqual([]);
  });
});
