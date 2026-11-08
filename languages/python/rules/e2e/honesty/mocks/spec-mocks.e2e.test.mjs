import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts();
afterEach(cleanup);

const RULE = 'mock-without-spec';
const MAILER = [
  'class Mailer:',
  '    def send(self, to, body):',
  '        return (to, body)',
  '',
  'def send(to, body):',
  '    return (to, body)',
  '',
].join('\n');
const CHECKOUT = [
  'from dataclasses import dataclass',
  'from typing import Optional',
  '',
  'from shop.mailer import Mailer, send',
  '',
  'class Checkout:',
  '    def __init__(self, mailer: Mailer, note: str = ""):',
  '        self.mailer = mailer',
  '',
  '    @classmethod',
  '    def build(cls, mailer: "Mailer"):',
  '        return cls(mailer)',
  '',
  '@dataclass',
  'class Order:',
  '    mailer: Optional[Mailer]',
  '    hook: object = None',
  '',
  'def notify(mailer: Mailer | None, hook):',
  '    return send("a", "b")',
  '',
].join('\n');

const specs = (test, extra = {}) =>
  findingsOf({
    'shop/__init__.py': '',
    'shop/mailer.py': MAILER,
    'shop/checkout.py': CHECKOUT,
    'tests/test_orders.py': test,
    ...extra,
  }).filter((finding) => finding.startsWith(`${RULE} `));

const lines = (...rows) => `${rows.join('\n')}\n`;

describe.skipIf(!enabled)('mock-without-spec', () => {
  it.each([
    [
      'a mock passed straight to a project class parameter',
      lines(
        'from unittest.mock import Mock',
        'from shop.checkout import Checkout, notify',
        '',
        'def test_a():',
        '    Checkout(Mock())',
        '    notify(mailer=Mock(), hook=Mock())',
      ),
      [
        `${RULE} tests/test_orders.py:5 Mock() for shop.mailer.Mailer`,
        `${RULE} tests/test_orders.py:6 Mock() for shop.mailer.Mailer`,
      ],
    ],
    [
      'a mock bound to a name, a self attribute or a fixture',
      lines(
        'import pytest',
        'from unittest import mock',
        'from shop.checkout import Checkout, Order',
        '',
        '@pytest.fixture',
        'def mailer():',
        '    return mock.MagicMock()',
        '',
        'def test_a(mailer):',
        '    Order(mailer)',
        '',
        'def test_b():',
        '    fake = mock.AsyncMock()',
        '    Checkout.build(fake)',
        '',
        'class TestCheckout:',
        '    def setup_method(self):',
        '        self.mailer = mock.Mock()',
        '',
        '    def test_c(self):',
        '        Checkout(self.mailer)',
      ),
      [
        `${RULE} tests/test_orders.py:7 Mock() for shop.mailer.Mailer`,
        `${RULE} tests/test_orders.py:13 Mock() for shop.mailer.Mailer`,
        `${RULE} tests/test_orders.py:18 Mock() for shop.mailer.Mailer`,
      ],
    ],
    [
      'patches of project code without autospec',
      lines(
        'from unittest.mock import patch',
        'from shop import mailer',
        '',
        '@patch("shop.checkout.send")',
        'def test_a(send):',
        '    with patch.object(mailer.Mailer, "send", return_value=1):',
        '        pass',
        '',
        'def test_b(mocker):',
        '    mocker.patch("shop.mailer.Mailer")',
      ),
      [
        `${RULE} tests/test_orders.py:4 patch of shop.mailer.send`,
        `${RULE} tests/test_orders.py:6 patch of shop.mailer.Mailer.send`,
        `${RULE} tests/test_orders.py:10 patch of shop.mailer.Mailer`,
      ],
    ],
    [
      'specced mocks, autospec, new values and library targets',
      lines(
        'from unittest.mock import Mock, create_autospec, patch',
        'from shop.checkout import Checkout, notify',
        'from shop.mailer import Mailer',
        '',
        'def test_a(mocker):',
        '    Checkout(Mock(spec=Mailer))',
        '    Checkout(Mock(Mailer))',
        '    Checkout(create_autospec(Mailer, instance=True))',
        '    Checkout(Mock(spec_set=Mailer), note=Mock())',
        '    notify(None, Mock())',
        '    patch("shop.checkout.send", autospec=True)',
        '    patch("shop.checkout.send", lambda to, body: None)',
        '    patch("shop.checkout.send", new=print)',
        '    mocker.patch("os.getcwd")',
        '    patch("shop.mailer.LIMIT")',
        '    Mock().send(1)',
      ),
      [],
    ],
    [
      'autospec turned off',
      lines(
        'from unittest.mock import patch',
        '',
        'def test_a():',
        '    with patch("shop.mailer.send", autospec=False):',
        '        pass',
      ),
      [`${RULE} tests/test_orders.py:4 patch of shop.mailer.send`],
    ],
  ])('%s', (_name, test, expected) => {
    expect(specs(test)).toEqual(expected);
  });

  it('leaves mocks of the module a test is named after to mocked-subject-in-test', () => {
    const test = lines(
      'from unittest.mock import Mock, patch',
      'from shop.checkout import Checkout',
      '',
      'def test_a():',
      '    patch("shop.mailer.send")',
      '    Checkout(Mock())',
    );

    expect(specs('', { 'tests/test_mailer.py': test })).toEqual([]);
  });

  it('does not check production code', () => {
    const code = lines(
      'from unittest.mock import Mock',
      'from shop.checkout import Checkout',
      '',
      'Checkout(Mock())',
    );

    expect(specs('', { 'shop/wiring.py': code })).toEqual([]);
  });
});
