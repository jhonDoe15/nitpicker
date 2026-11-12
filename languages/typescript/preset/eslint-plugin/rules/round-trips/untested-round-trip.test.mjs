import { Linter } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterEach, describe, expect, it } from 'vitest';
import { rule } from './untested-round-trip.mjs';

const roots = [];
const CODEC = [
  'export function encodeToken(value: string): string { return btoa(value); }',
  'export const decodeToken = (text: string): string => atob(text);',
  'export class Order {',
  '  constructor(readonly total: number) {}',
  '  toJson(): string { return String(this.total); }',
  '  static fromJson(text: string): Order { return new Order(Number(text)); }',
  '  private parseLine(): void {}',
  '}',
].join('\n');

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-round-trips-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function reported(root, code, file = 'src/codec.ts') {
  const config = {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { local: { rules: { 'untested-round-trip': rule } } },
    rules: { 'local/untested-round-trip': 'error' },
  };
  return new Linter({ cwd: root })
    .verify(code, config, { filename: path.join(root, file) })
    .map(({ line, message }) => `${String(line)} ${message}`);
}

describe('untested-round-trip', () => {
  it('reports each exported pair that no single test calls on both sides', () => {
    const root = project({
      'test/codec.test.ts': [
        "import { decodeToken, encodeToken, Order } from '../src/codec';",
        "it('encodes', () => { expect(encodeToken('a')).toBe('YQ=='); });",
        "it('decodes', () => { expect(decodeToken('YQ==')).toBe('a'); });",
        "test('prints', () => { expect(new Order(1).toJson()).toBe('1'); });",
      ].join('\n'),
    });

    expect(reported(root, CODEC)).toEqual([
      '2 encodeToken and decodeToken turn values into each other, and no test runs one on the output of the other, so a field that one of them drops or garbles goes unnoticed. Add a test that calls both on the same value: expect(decodeToken(encodeToken(value))).toEqual(value), with values that need escaping or mapping (quotes, newlines, non-ASCII, empty and absent fields).',
      '6 Order.toJson and Order.fromJson turn values into each other, and no test runs one on the output of the other, so a field that one of them drops or garbles goes unnoticed. Add a test that calls both on the same value: expect(Order.fromJson(value.toJson())).toEqual(value), with values that need escaping or mapping (quotes, newlines, non-ASCII, empty and absent fields).',
    ]);
  });

  it('accepts a test that calls both, also through a helper in a test file', () => {
    const root = project({
      'test/helpers.ts': [
        "import { Order } from '../src/codec';",
        'export const roundTrip = (order: Order) => Order.fromJson(order.toJson());',
      ].join('\n'),
      'test/codec.test.ts': [
        "import { decodeToken, encodeToken, Order } from '../src/codec';",
        "import { roundTrip } from './helpers';",
        "it.each(['a', 'é\\n'])('round-trips %s', (value) => {",
        '  expect(decodeToken(encodeToken(value))).toBe(value);',
        '});',
        "describe('order', () => { it('round-trips', () => { expect(roundTrip(new Order(1)).total).toBe(1); }); });",
      ].join('\n'),
    });

    expect(reported(root, CODEC)).toEqual([]);
  });

  it('skips unexported, private, abstract and one-sided declarations', () => {
    const root = project({ 'test/other.test.ts': "it('a', () => { expect(1).toBe(1); });" });
    const code = [
      'function encode(value: string): string { return value; }',
      'export function decode(text: string): string { return encode(text); }',
      'export abstract class Codec {',
      '  abstract serialize(): string;',
      '  abstract deserialize(text: string): void;',
      '}',
      'export function to(value: string): string { return value; }',
      'export function from(value: string): string { return value; }',
      'export function parseDate(text: string): string { return text; }',
      'export function formatTime(value: string): string { return value; }',
    ].join('\n');

    expect(reported(root, code)).toEqual([]);
  });

  it('follows names exported in a list', () => {
    const root = project({ 'test/other.test.ts': "it('a', () => { expect(1).toBe(1); });" });
    const code = [
      'function pack(value: string): string { return value; }',
      'function unpack(text: string): string { return text; }',
      'export { pack, unpack };',
    ].join('\n');

    expect(reported(root, code).map((found) => found.split(' turn ')[0])).toEqual([
      '2 pack and unpack',
    ]);
  });

  it('follows tagged tables, callbacks passed by name and helper chains inside describe', () => {
    const root = project({
      'test/codec.test.ts': [
        "import { decodeToken, encodeToken, Order } from '../src/codec';",
        "describe('codec', () => {",
        '  const decoded = (text: string) => decodeToken(text);',
        '  function roundTrip(value: string) { return decoded(encodeToken(value)); }',
        "  const checkToken = () => { expect(roundTrip('a')).toBe('a'); };",
        "  it('round-trips', checkToken);",
        '});',
        'test.each`order',
        `  \${new Order(1)}`,
        "`('round-trips $order', ({ order }) => { expect(Order.fromJson(order.toJson())).toEqual(order); });",
      ].join('\n'),
    });

    expect(reported(root, CODEC)).toEqual([]);
  });

  it('sees function values behind type assertions and skips toString and fromString', () => {
    const root = project({ 'test/other.test.ts': "it('a', () => { expect(1).toBe(1); });" });
    const code = [
      'export const encodeName = ((value: string) => value) as (value: string) => string;',
      'export const decodeName = ((text: string) => text) satisfies (text: string) => string;',
      'export class Name {',
      '  toString(): string { return "n"; }',
      '  static fromString(text: string): Name { return new Name(); }',
      '}',
    ].join('\n');

    expect(reported(root, code).map((found) => found.split(' turn ')[0])).toEqual([
      '2 encodeName and decodeName',
    ]);
  });
});
