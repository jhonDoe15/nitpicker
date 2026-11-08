import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts();
afterEach(cleanup);

const RULE = 'patch-misses-lookup';
const lines = (...rows) => `${rows.join('\n')}\n`;
const MAILER = lines(
  'LIMIT = 3',
  '',
  'def send(to, body):',
  '    return (to, body)',
  '',
  'class Mailer:',
  '    pass',
);
const CHECKOUT = lines(
  'from shop.mailer import send',
  'from .mailer import Mailer as Sender',
  '',
  'def pay():',
  '    return send("a", "b"), Sender()',
);
const BILLING = lines(
  'from shop import mailer',
  '',
  'def bill():',
  '    return mailer.send("a", "b")',
);

const lookups = (test, extra = {}) =>
  findingsOf({
    'shop/__init__.py': '',
    'shop/mailer.py': MAILER,
    'shop/checkout.py': CHECKOUT,
    'shop/billing.py': BILLING,
    'tests/test_orders.py': test,
    ...extra,
  }).filter((finding) => finding.startsWith(`${RULE} `));

describe.skipIf(!enabled)('patch-misses-lookup', () => {
  it.each([
    [
      'patch, mocker.patch and monkeypatch of the defining module',
      lines(
        'from unittest import mock',
        'from shop import mailer',
        'from shop.checkout import pay',
        '',
        '@mock.patch("shop.mailer.send", autospec=True)',
        'def test_a(send, mocker, monkeypatch):',
        '    mocker.patch("shop.mailer.Mailer")',
        '    monkeypatch.setattr("shop.mailer.LIMIT", 1)',
        '    monkeypatch.setattr(mailer, "send", print)',
        '    mock.patch.object(mailer, "send", autospec=True)',
      ),
      [
        `${RULE} tests/test_orders.py:5 shop.mailer.send (looked up as shop.checkout.send)`,
        `${RULE} tests/test_orders.py:7 shop.mailer.Mailer (looked up as shop.checkout.Sender)`,
        `${RULE} tests/test_orders.py:9 shop.mailer.send (looked up as shop.checkout.send)`,
        `${RULE} tests/test_orders.py:10 shop.mailer.send (looked up as shop.checkout.send)`,
      ],
    ],
    [
      'patches where the name is looked up',
      lines(
        'from unittest.mock import patch',
        'from shop.checkout import pay',
        'from shop.billing import bill',
        '',
        '@patch("shop.checkout.send", autospec=True)',
        'def test_a(send):',
        '    pay()',
        '',
        'def test_b(mocker):',
        '    mocker.patch("shop.checkout.Sender")',
        '    mocker.patch("shop.mailer.send", autospec=True)',
        '    mocker.patch("shop.checkout.send", autospec=True)',
      ),
      [],
    ],
    [
      'a module that reaches the name through its module',
      lines(
        'from unittest.mock import patch',
        'from shop.billing import bill',
        '',
        '@patch("shop.mailer.send", autospec=True)',
        'def test_a(send):',
        '    bill()',
      ),
      [],
    ],
    [
      'a name imported inside a function',
      lines(
        'from unittest.mock import patch',
        'from shop import late',
        '',
        '@patch("shop.mailer.send", autospec=True)',
        'def test_a(send):',
        '    late.run()',
      ),
      [],
    ],
  ])('%s', (_name, test, expected) => {
    const late = lines(
      'def run():',
      '    from shop.mailer import send',
      '    return send("a", "b")',
    );

    expect(lookups(test, { 'shop/late.py': late })).toEqual(expected);
  });

  it('follows a plain dotted import and skips imports for type checking only', () => {
    const typed = lines(
      'from typing import TYPE_CHECKING',
      '',
      'if TYPE_CHECKING:',
      '    from shop.mailer import send',
    );
    const test = lines(
      'import shop.checkout',
      'from shop import typed',
      'from unittest.mock import patch',
      '',
      '@patch("shop.mailer.send", autospec=True)',
      'def test_a(send):',
      '    shop.checkout.pay()',
    );

    expect(lookups(test, { 'shop/typed.py': typed })).toEqual([
      `${RULE} tests/test_orders.py:5 shop.mailer.send (looked up as shop.checkout.send)`,
    ]);
  });

  it('does not count a package that re-exports the name when the test imports a module of it', () => {
    const test = lines(
      'from shop import mailer',
      'from unittest.mock import patch',
      '',
      '@patch("shop.mailer.Mailer", autospec=True)',
      'def test_a(sender):',
      '    mailer.Mailer()',
    );

    expect(lookups(test, { 'shop/__init__.py': 'from shop.mailer import Mailer\n' })).toEqual([]);
  });

  it('leaves the module a test is named after to mocked-subject-in-test', () => {
    const test = lines(
      'from unittest.mock import patch',
      'from shop.checkout import pay',
      '',
      '@patch("shop.mailer.send", autospec=True)',
      'def test_a(send):',
      '    pay()',
    );

    expect(lookups('', { 'tests/test_mailer.py': test })).toEqual([]);
  });
});
