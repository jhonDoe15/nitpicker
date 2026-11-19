import { expect, it } from 'vitest';
import { useScripts } from '../../../test-support/python-rule-scripts.mts';

const { findingsOf, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

const RULE = 'copy-pasted-tests';
const lines = (...rows: string[]) => `${rows.join('\n')}\n`;
const SHOP = { 'shop/__init__.py': '', 'shop/prices.py': 'def total(a):\n    return a\n' };

const copies = (code: string) =>
  findingsOf({ ...SHOP, 'tests/test_prices.py': code }).filter((finding) =>
    finding.startsWith(`${RULE} `),
  );

describeRules('copy-pasted-tests', () => {
  it('reports the third and later tests that differ only in literals', () => {
    const code = lines(
      'from shop.prices import total',
      '',
      'def test_a():',
      '    assert total(1) == 1',
      '',
      'def test_b():',
      '    assert total(-2) == 2',
      '',
      'def test_c():',
      '    assert total(3) == 3',
      '',
      'class TestPrices:',
      '    def test_d(self):',
      '        """one"""',
      '        assert total("a") is not None',
      '',
      '    def test_e(self):',
      '        assert total("b") is not None',
      '',
      '    def test_f(self):',
      '        assert total("c") is not None',
    );

    expect(copies(code)).toEqual([
      `${RULE} tests/test_prices.py:9 test_c:2`,
      `${RULE} tests/test_prices.py:20 TestPrices.test_f:2`,
    ]);
  });

  it('accepts a parametrized test, two copies and tests that differ in a call', () => {
    const code = lines(
      'import pytest',
      'from shop.prices import total',
      '',
      '@pytest.mark.parametrize("a", [1, 2, 3])',
      'def test_a(a):',
      '    assert total(a) == a',
      '',
      'def test_b():',
      '    assert total(1) == 1',
      '',
      'def test_c():',
      '    assert total(2) == 2',
      '',
      'def test_d():',
      '    assert max(2, 3) == 3',
      '',
      'def test_e():',
      '    assert min(2, 3) == 2',
    );

    expect(copies(code)).toEqual([]);
  });

  it('keeps tests apart whose marks differ in more than a literal', () => {
    const code = lines(
      'import pytest',
      'from shop.prices import total',
      '',
      '@pytest.mark.xfail(raises=ValueError)',
      'def test_a():',
      '    assert total(1) == 1',
      '',
      '@pytest.mark.xfail(raises=KeyError)',
      'def test_b():',
      '    assert total(2) == 2',
      '',
      '@pytest.mark.xfail(raises=TypeError)',
      'def test_c():',
      '    assert total(3) == 3',
    );

    expect(copies(code)).toEqual([]);
  });
});
