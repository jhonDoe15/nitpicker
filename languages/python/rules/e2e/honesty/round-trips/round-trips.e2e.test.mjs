import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts();
afterEach(cleanup);

const RULE = 'untested-round-trip';
const lines = (...rows) => `${rows.join('\n')}\n`;
const CODEC = lines(
  'import json',
  '',
  'def encode_token(value):',
  '    return json.dumps(value)',
  '',
  'def decode_token(text):',
  '    return json.loads(text)',
  '',
  'class Order:',
  '    def __init__(self, total):',
  '        self.total = total',
  '',
  '    def to_dict(self):',
  '        return {"total": self.total}',
  '',
  '    @classmethod',
  '    def from_dict(cls, data):',
  '        return cls(data["total"])',
);

const trips = (files) =>
  findingsOf({ 'shop/__init__.py': '', 'shop/codec.py': CODEC, ...files }).filter((finding) =>
    finding.startsWith(`${RULE} `),
  );

describe.skipIf(!enabled)('untested-round-trip', () => {
  it('reports each pair that no single test calls on both sides', () => {
    const test = lines(
      'from shop.codec import Order, decode_token, encode_token',
      '',
      'def test_encode():',
      '    assert encode_token(1) == "1"',
      '',
      'def test_decode():',
      '    assert decode_token("1") == 1',
      '',
      'def test_order():',
      '    assert Order(1).to_dict() == {"total": 1}',
    );

    expect(trips({ 'tests/test_codec.py': test })).toEqual([
      `${RULE} shop/codec.py:6 encode_token and decode_token`,
      `${RULE} shop/codec.py:17 Order.to_dict and Order.from_dict`,
    ]);
  });

  it('accepts a test that calls both, also through a helper of the tests', () => {
    const helper = lines(
      'from shop.codec import Order',
      '',
      'def round_trip(order):',
      '    return Order.from_dict(order.to_dict())',
    );
    const test = lines(
      'from shop.codec import Order, decode_token, encode_token',
      'from tests.support import round_trip',
      '',
      'def test_token():',
      '    encoded = encode_token({"a": "x\\ny"})',
      '    assert decode_token(encoded) == {"a": "x\\ny"}',
      '',
      'class TestOrder:',
      '    def test_order(self):',
      '        assert round_trip(Order(1)).total == 1',
    );

    expect(trips({ 'tests/support.py': helper, 'tests/test_codec.py': test })).toEqual([]);
  });

  it('skips private, abstract and protocol halves and lone directions', () => {
    const code = lines(
      'from abc import abstractmethod',
      'from typing import Protocol',
      '',
      'def _encode(value):',
      '    return value',
      '',
      'def decode(value):',
      '    return value',
      '',
      'def to(value):',
      '    return value',
      '',
      'def from_(value):',
      '    return value',
      '',
      'class Codec(Protocol):',
      '    def encode(self, value): ...',
      '    def decode(self, text): ...',
      '',
      'class Base:',
      '    @abstractmethod',
      '    def dumps(self): ...',
      '    def loads(self, text):',
      '        raise NotImplementedError',
      '',
      'def parse_date(text):',
      '    return text',
      '',
      'def format_time(value):',
      '    return value',
    );

    expect(trips({ 'shop/other.py': code })).toEqual([
      `${RULE} shop/codec.py:6 encode_token and decode_token`,
      `${RULE} shop/codec.py:17 Order.to_dict and Order.from_dict`,
    ]);
  });

  it('does not check pairs defined in tests', () => {
    const test = lines(
      'def encode(v):',
      '    return v',
      '',
      'def decode(v):',
      '    return v',
      '',
      'def test_a():',
      '    assert encode(1) == 1',
    );

    expect(
      trips({ 'tests/test_local.py': test }).filter((found) => found.includes('tests/')),
    ).toEqual([]);
  });

  it('follows fixtures, helper chains, helper methods and nested or guarded definitions', () => {
    const code = lines(
      'import sys',
      '',
      'if sys.version_info >= (3, 11):',
      '    def pack_row(row):',
      '        return row',
      'else:',
      '    def pack_row(row):',
      '        return list(row)',
      '',
      'def unpack_row(data):',
      '    return data',
      '',
      'class Wire:',
      '    class Frame:',
      '        def to_bytes(self):',
      '            return b""',
      '',
      '        @classmethod',
      '        def from_bytes(cls, data):',
      '            return cls()',
      '',
      'class Name:',
      '    def to_string(self):',
      '        return ""',
      '',
      '    @classmethod',
      '    def from_string(cls, text):',
      '        return cls()',
    );
    const conftest = lines(
      'import pytest',
      'from shop.codec import Order',
      '',
      '@pytest.fixture',
      'def order_copy():',
      '    return copy_of(Order(1))',
      '',
      'def copy_of(order):',
      '    return Order.from_dict(order.to_dict())',
    );
    const test = lines(
      'from shop.codec import decode_token, encode_token',
      'from shop.rows import Wire, pack_row, unpack_row',
      '',
      'class TestRows:',
      '    def check(self, value):',
      '        assert decode_token(encode_token(value)) == value',
      '',
      '    def test_token(self):',
      '        self.check("x")',
      '',
      '    def test_row(self):',
      '        assert unpack_row(pack_row([1])) == [1]',
      '',
      'def test_order(order_copy):',
      '    assert order_copy.total == 1',
    );

    expect(
      trips({ 'shop/rows.py': code, 'tests/conftest.py': conftest, 'tests/test_rows.py': test }),
    ).toEqual([`${RULE} shop/rows.py:19 Wire.Frame.to_bytes and Wire.Frame.from_bytes`]);
  });
});
