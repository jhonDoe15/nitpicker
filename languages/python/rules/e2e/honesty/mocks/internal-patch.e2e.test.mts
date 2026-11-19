import { expect, it } from 'vitest';
import { useScripts } from '../../../test-support/python-rule-scripts.mts';

const { findingsOf, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

const RULE = 'internal-module-patch';
const lines = (...rows: string[]) => `${rows.join('\n')}\n`;
const MAILER = lines(
  'LIMIT = 3',
  '',
  'def send(to, body):',
  '    return (to, body)',
  '',
  'class Mailer:',
  '    pass',
);
const CHECKOUT = lines('def pay():', '    return 1');

const patches = (test: string, name = 'tests/test_orders.py') =>
  findingsOf({
    'shop/__init__.py': '',
    'shop/mailer.py': MAILER,
    'shop/checkout.py': CHECKOUT,
    [name]: test,
  }).filter((finding) => finding.startsWith(`${RULE} `));

describeRules(RULE, () => {
  it('reports patch, patch.object, patch.dict, mocker.patch and monkeypatch on project code', () => {
    const test = lines(
      'from unittest import mock',
      'from unittest.mock import patch',
      'from shop import mailer',
      '',
      '@patch("shop.mailer.send")',
      'def test_a(send, mocker, monkeypatch):',
      '    mocker.patch("shop.mailer.Mailer")',
      '    mocker.patch.object(mailer, "send")',
      '    monkeypatch.setattr("shop.mailer.LIMIT", 1)',
      '    monkeypatch.setattr(mailer, "send", print)',
      '    mock.patch.object(mailer, "send")',
      '    mock.patch.dict("shop.mailer.SETTINGS", {"a": 1})',
      '    mock.patch.dict(mailer.SETTINGS, {"a": 1})',
    );

    expect(patches(test)).toEqual([
      `${RULE} tests/test_orders.py:5 shop.mailer.send`,
      `${RULE} tests/test_orders.py:7 shop.mailer.Mailer`,
      `${RULE} tests/test_orders.py:8 shop.mailer.send`,
      `${RULE} tests/test_orders.py:10 shop.mailer.send`,
      `${RULE} tests/test_orders.py:11 shop.mailer.send`,
      `${RULE} tests/test_orders.py:12 shop.mailer.SETTINGS`,
      `${RULE} tests/test_orders.py:13 shop.mailer.SETTINGS`,
    ]);
  });

  it('allows third-party and standard-library targets, constants and fakes passed in', () => {
    const test = lines(
      'import os',
      'from unittest import mock',
      'from unittest.mock import patch',
      'from shop.checkout import pay',
      '',
      '@patch("time.sleep")',
      'def test_a(sleep, mocker, monkeypatch):',
      '    monkeypatch.setattr("shop.mailer.LIMIT", 1)',
      '    mocker.patch("requests.get")',
      '    monkeypatch.setattr("httpx.get", print)',
      '    mock.patch.dict(os.environ, {"A": "1"})',
      '    mock.patch.object(os, "getcwd")',
      '    assert pay(mock.Mock()) == 1',
    );

    expect(patches(test)).toEqual([]);
  });

  it('leaves the module a test is named after to mocked-subject-in-test', () => {
    const test = lines(
      'from unittest.mock import patch',
      'from shop.mailer import send',
      '',
      '@patch("shop.mailer.send")',
      'def test_a(mocked):',
      '    send("a", "b")',
    );

    expect(patches(test, 'tests/test_mailer.py')).toEqual([]);
  });

  it('does not report a patch in production code', () => {
    const production = lines('from unittest.mock import patch', '', 'patch("shop.mailer.send")');

    expect(patches('', 'shop/helpers.py').length).toBe(0);
    expect(patches(production, 'shop/fake.py')).toEqual([]);
  });
});
