import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts();
afterEach(cleanup);

const RULE = 'mocked-subject-in-test';
const CART = [
  'import requests',
  '',
  'LIMIT = 3',
  '',
  'def total(items):',
  '    return sum(items)',
  '',
  'class Cart:',
  '    def __init__(self, items):',
  '        self.items = items',
  '',
  '    def total(self):',
  '        return total(self.items)',
  '',
  '    def fetch(self):',
  '        return requests.get("https://example.com")',
  '',
].join('\n');

const mocks = (test, extra = {}) =>
  findingsOf({ 'shop/cart.py': CART, 'tests/test_cart.py': test, ...extra }).filter((finding) =>
    finding.startsWith(`${RULE} `),
  );

describe.skipIf(!enabled)('mocked-subject-in-test', () => {
  it.each([
    [
      'patch of a function the subject module defines',
      'from unittest.mock import patch\n\n@patch("shop.cart.total")\ndef test_a(total):\n    pass\n',
      [`${RULE} tests/test_cart.py:3 shop.cart.total`],
    ],
    [
      'mocker.patch of a method of the subject class',
      'def test_a(mocker):\n    mocker.patch("shop.cart.Cart.total", return_value=1)\n',
      [`${RULE} tests/test_cart.py:2 shop.cart.Cart.total`],
    ],
    [
      'patch.object on an instance of the subject',
      'from unittest import mock\nfrom shop.cart import Cart\n\ndef test_a():\n    cart = Cart([1])\n    with mock.patch.object(cart, "total", return_value=2):\n        assert cart.total() == 2\n',
      [`${RULE} tests/test_cart.py:6 cart.total`],
    ],
    [
      'monkeypatch.setattr on the subject class and module',
      'from shop import cart\nfrom shop.cart import Cart\n\ndef test_a(monkeypatch):\n    monkeypatch.setattr(Cart, "total", lambda self: 1)\n    monkeypatch.setattr(cart, "total", lambda items: 1)\n    monkeypatch.setattr("shop.cart.total", lambda items: 1)\n',
      [
        `${RULE} tests/test_cart.py:5 shop.cart.Cart.total`,
        `${RULE} tests/test_cart.py:6 shop.cart.total`,
        `${RULE} tests/test_cart.py:7 shop.cart.total`,
      ],
    ],
    [
      'a method of a fixture instance replaced by a mock',
      'import pytest\nfrom unittest.mock import MagicMock\nfrom shop.cart import Cart\n\n@pytest.fixture\ndef cart():\n    return Cart([1])\n\ndef test_a(cart):\n    cart.fetch = MagicMock()\n',
      [`${RULE} tests/test_cart.py:10 cart.fetch`],
    ],
    [
      'a mock specced from the subject class',
      'from unittest.mock import Mock, create_autospec\nfrom shop.cart import Cart\n\ndef test_a():\n    first = Mock(spec=Cart)\n    second = create_autospec(Cart)\n',
      [
        `${RULE} tests/test_cart.py:5 shop.cart.Cart`,
        `${RULE} tests/test_cart.py:6 shop.cart.Cart`,
      ],
    ],
    [
      'a collaborator or data attribute replaced on a subject instance',
      'from unittest import mock\nfrom shop.cart import Cart\n\ndef test_a(monkeypatch):\n    cart = Cart([1])\n    cart.client = mock.Mock()\n    monkeypatch.setattr(cart, "items", [])\n    with mock.patch.object(cart, "client", mock.Mock()):\n        pass\n    mock.patch("shop.cart.Cart.client", new=1)\n',
      [],
    ],
    [
      'a name bound to the subject only in another test',
      'from unittest import mock\nfrom shop.cart import Cart\n\ndef test_a():\n    cart = Cart([1])\n    assert cart.total() == 1\n\ndef test_b(other):\n    cart = other.make()\n    with mock.patch.object(cart, "total"):\n        pass\n',
      [],
    ],
    [
      'an instance kept on self in setUp',
      'import unittest\nfrom unittest import mock\nfrom shop.cart import Cart\n\nclass CartTest(unittest.TestCase):\n    def setUp(self):\n        self.cart = Cart([1])\n\n    def test_a(self):\n        with mock.patch.object(self.cart, "fetch"):\n            pass\n',
      [`${RULE} tests/test_cart.py:10 self.cart.fetch`],
    ],
    [
      'instances from a fixture local, a with block and an annotated parameter',
      'import pytest\nfrom unittest import mock\nfrom shop.cart import Cart\n\n@pytest.fixture\ndef cart():\n    made = Cart([1])\n    return made\n\ndef test_a(cart, other: Cart):\n    mock.patch.object(cart, "total")\n    mock.patch.object(other, "fetch")\n    with Cart([1]) as held:\n        mock.patch.object(held, "total")\n',
      [
        `${RULE} tests/test_cart.py:11 cart.total`,
        `${RULE} tests/test_cart.py:12 other.fetch`,
        `${RULE} tests/test_cart.py:14 held.total`,
      ],
    ],
    [
      'a positional spec and patch.multiple on the module object',
      'from unittest import mock\nfrom shop import cart\nfrom shop.cart import Cart\n\ndef test_a():\n    mock.Mock(Cart)\n    mock.patch.multiple(cart, total=mock.DEFAULT)\n',
      [
        `${RULE} tests/test_cart.py:6 shop.cart.Cart`,
        `${RULE} tests/test_cart.py:7 shop.cart.total`,
      ],
    ],
    [
      'patches of what the subject imports, of a constant and of another module',
      'from unittest.mock import Mock, patch\n\n@patch("shop.cart.requests.get")\n@patch("shop.cart.LIMIT", 1)\n@patch("shop.prices.rate")\ndef test_a(*mocks):\n    Mock(spec=dict)\n',
      [],
    ],
  ])('%s', (_name, test, expected) => {
    expect(mocks(test, { 'shop/prices.py': 'def rate():\n    return 1\n' })).toEqual(expected);
  });

  it('follows a class the package re-exports', () => {
    const test =
      'from unittest import mock\nfrom shop import Cart\n\ndef test_a():\n    mock.patch.object(Cart, "total")\n';
    expect(mocks(test, { 'shop/__init__.py': 'from .cart import Cart\n' })).toEqual([
      `${RULE} tests/test_cart.py:5 shop.Cart.total`,
    ]);
  });

  it('reads the subject from a file named cart_test.py and leaves other test files alone', () => {
    const patching =
      'from unittest.mock import patch\n\n@patch("shop.cart.total")\ndef test_a(total):\n    pass\n';
    expect(
      findingsOf({
        'shop/cart.py': CART,
        'tests/cart_test.py': patching,
        'tests/test_checkout.py': patching,
      }).filter((finding) => finding.startsWith(`${RULE} `)),
    ).toEqual([`${RULE} tests/cart_test.py:3 shop.cart.total`]);
  });
});
