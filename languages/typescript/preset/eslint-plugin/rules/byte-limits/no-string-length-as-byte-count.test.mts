import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-string-length-as-byte-count.mts';

const tester = typescriptRuleTester();

function flagged(code: string, count = 1) {
  return { code, errors: Array.from({ length: count }, () => ({ messageId: 'countBytes' })) };
}

tester.run('no-string-length-as-byte-count', rule, {
  valid: [
    {
      code: 'export function f(id: string) { return Buffer.byteLength(id, "utf8") > MAX_IDENTIFIER_BYTES; }',
    },
    {
      code: 'export function f(id: string) { return new TextEncoder().encode(id).byteLength > maxBytes; }',
    },
    { code: 'export function f(buf: Buffer) { return buf.length > MAX_KEY_BYTES; }' },
    { code: 'export function f(bytes: Uint8Array) { return bytes.length > MAX_BYTES; }' },
    { code: 'export function f(id: string) { return id.length > MAX_IDENTIFIER_LENGTH; }' },
    { code: 'export function f(id: string) { return id.length > MAX_CHARS; }' },
    { code: 'export function f(items: string[]) { return items.length > MAX_BYTES; }' },
    { code: 'export function f(items: number[]) { return items.slice(0, MAX_BYTES); }' },
    { code: 'export function f(value: string, size: number) { return value.slice(0, size); }' },
    { code: 'export function f(text: string) { return text.length > text.byteLength; }' },
    { code: 'export function f(value: unknown) { return value.length > MAX_BYTES; }' },
    {
      code:
        'export function f(b: Uint8Array) { const out = []; for (let i = 0; i < b.length; i += CHUNK_BYTES) { ' +
        'out.push(b.slice(i, i + CHUNK_BYTES)); } return out; }',
    },
  ],
  invalid: [
    flagged(
      'export function f(identifier: string) { return identifier.length > MAX_IDENTIFIER_BYTES; }',
    ),
    flagged('export function f(key: string) { return key.length >= this.maxBytes; }'),
    flagged('export function f(s: string) { return limitInBytes < s.length; }'),
    flagged(
      'export function f(s: string, suffix: string) { return s.length + suffix.length > MAX_KEY_BYTES; }',
    ),
    flagged('export const ok = "abc".length <= LIMIT_BYTES;'),
    flagged('export const big = JSON.stringify(data).length > options.maxBytes;'),
    flagged(
      'export function f(value: string) { const out = []; for (let i = 0; i < value.length; i += CHUNK_BYTES) { ' +
        'out.push(value.slice(i, i + CHUNK_BYTES)); } return out; }',
      2,
    ),
    flagged('export function f(value: string) { return value.substring(0, chunkByteSize); }'),
  ],
});
