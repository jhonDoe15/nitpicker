import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const RULE = 'shared-test-state';
const { cleanup, findingsOf } = createScripts();
afterEach(cleanup);

const sharedOf = (code, file = 'tests/test_cart.py') =>
  findingsOf({ [file]: code }).filter((line) => line.startsWith(`${RULE} `));
const at = (line, subject) => `${RULE} tests/test_cart.py:${String(line)} ${subject}`;

describe.skipIf(!enabled)('state that the tests of a module or class share', () => {
  it('reports writes from tests to module-level collections and rebound globals', () => {
    const code = `import collections

SEEN = []
TOTALS = {}
TAGS = set()
QUEUE = collections.deque()
FIXED = ("a",)
calls = 0


def record(value):
    SEEN.append(value)


def test_adds():
    global calls
    calls += 1
    TOTALS["a"] = 1
    TAGS.add("x")
    QUEUE.appendleft(1)
    record("b")
    assert FIXED


def test_reads():
    SEEN = []
    SEEN.append("local")
    assert len(TOTALS) >= 0
`;

    expect(sharedOf(code)).toEqual([
      at(12, 'SEEN'),
      at(17, 'calls'),
      at(18, 'TOTALS'),
      at(19, 'TAGS'),
      at(20, 'QUEUE'),
    ]);
  });

  it('reports class attributes that test methods change', () => {
    const code = `import unittest


class TestCart:
    items = []
    count = 0

    def test_adds(self):
        self.items.append("a")
        TestCart.count += 1
        assert self.items


class CartTest(unittest.TestCase):
    seen = {}

    def test_marks(self):
        self.seen["a"] = True
        type(self).seen["b"] = True
        self.assertTrue(self.seen)

    def test_rebinds_on_the_instance(self):
        self.count = 1
        self.assertEqual(self.count, 1)
`;

    expect(sharedOf(code)).toEqual([
      at(9, 'TestCart.items'),
      at(10, 'TestCart.count'),
      at(18, 'CartTest.seen'),
      at(19, 'CartTest.seen'),
    ]);
  });

  it('accepts state that a per-test hook or fixture resets, and set-up done once', () => {
    const code = `import pytest

SEEN = []
TOTALS = {}
LOADED = []
calls = 0


@pytest.fixture(autouse=True)
def fresh():
    global calls
    calls = 0
    SEEN.clear()
    yield
    TOTALS.clear()


@pytest.fixture(scope="module")
def loaded():
    LOADED.append("once")
    return LOADED


def test_adds(loaded):
    global calls
    calls += 1
    SEEN.append("a")
    TOTALS["a"] = 1
    assert loaded


class TestCart:
    items = []

    def setup_method(self):
        self.items = []

    def test_adds(self):
        self.items.append("a")
        assert self.items == ["a"]
`;

    expect(sharedOf(code)).toEqual([]);
  });

  it('follows nested items and tuple targets, and leaves instance attributes alone', () => {
    const code = `import collections

CACHE = collections.defaultdict(list)
PAIR = [0, 0]


class TestCart:
    items = []

    def test_rebinds_first(self):
        self.items = []
        self.items.append("a")
        assert self.items == ["a"]


def test_nested():
    CACHE["a"].append(1)
    PAIR[0], PAIR[1] = 1, 2
    keep = lambda CACHE: CACHE.append(1)
    assert keep
`;

    expect(sharedOf(code)).toEqual([at(17, 'CACHE'), at(18, 'PAIR'), at(18, 'PAIR')]);
  });

  it('leaves modules that are not tests alone', () => {
    const code = `SEEN = []


def record(value):
    SEEN.append(value)
`;

    expect(sharedOf(code, 'tests/support/recorder.py')).toEqual([]);
  });
});
