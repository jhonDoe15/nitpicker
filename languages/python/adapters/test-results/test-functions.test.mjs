import { describe, expect, it } from 'vitest';
import { testFunction, testPath } from './test-functions.mjs';

const SOURCE = `import pytest


def helper():
    return 1


@pytest.mark.parametrize(
    "value",
    [1, 2],
)
def test_positive(value):
    assert value > 0


class TestOrder:
    @pytest.fixture
    def cart(self):
        return []

    async def test_total(self, cart):
        assert sum(
            cart
        ) == 0

    class TestNested:
        def test_inner(self):
            assert True


def test_last():
    pass
`;

describe('testPath', () => {
  it('splits a pytest test name and drops its parameters', () => {
    expect(testPath('TestOrder::test_total')).toEqual(['TestOrder', 'test_total']);
    expect(testPath('test_positive[1-a::b]')).toEqual(['test_positive']);
  });
});

describe('testFunction', () => {
  it('returns the function with its decorators and its def line', () => {
    expect(testFunction(SOURCE, ['test_positive'])).toEqual({
      line: 12,
      text: [
        '@pytest.mark.parametrize(',
        '"value",',
        '[1, 2],',
        ')',
        'def test_positive(value):',
        'assert value > 0',
      ].join('\n'),
    });
  });

  it('finds a method in a class, keeping a closing bracket at the def indent', () => {
    expect(testFunction(SOURCE, ['TestOrder', 'test_total'])).toEqual({
      line: 21,
      text: 'async def test_total(self, cart):\nassert sum(\ncart\n) == 0',
    });
  });

  it('finds a method in a nested class and the last function of the file', () => {
    expect(testFunction(SOURCE, ['TestOrder', 'TestNested', 'test_inner'])?.line).toBe(27);
    expect(testFunction(SOURCE, ['test_last'])).toEqual({
      line: 31,
      text: 'def test_last():\npass',
    });
  });

  it('does not take a method of another class or a missing function', () => {
    expect(testFunction(SOURCE, ['test_total'])).toBeUndefined();
    expect(testFunction(SOURCE, ['TestOrder', 'test_last'])).toBeUndefined();
    expect(testFunction(SOURCE, ['TestMissing', 'test_total'])).toBeUndefined();
  });
});
