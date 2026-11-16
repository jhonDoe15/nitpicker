import { bannedAndAllowedCase, describeEngineParity } from '../../test-support/engine-parity.mts';

const BANNED = [
  'export function width(start: boolean, end: boolean): number {',
  '  if (end || end) {',
  '    return 40;',
  '  }',
  '  return start ? 20 : 0;',
  '}',
  'export const inRange = (x: number) => x < 3 && x > 5;',
  'export const isNumber = (x: number) => x === x;',
  'export function add(total: number, price: number): number {',
  '  let sum = total;',
  '  sum += sum + price;',
  '  return sum;',
  '}',
].join('\n');

const BANNED_LINES = [2, 7, 8, 11];

const ALLOWED = [
  'export function width(start: boolean, end: boolean): number {',
  '  if (start || end) {',
  '    return 40;',
  '  }',
  '  return 0;',
  '}',
  'export const inRange = (x: number) => x > 3 && x < 5;',
  'export const isNumber = (x: number) => !Number.isNaN(x);',
  'export function add(total: number, price: number): number {',
  '  let sum = total;',
  '  sum += price;',
  '  return sum;',
  '}',
].join('\n');

const BANNED_JAVASCRIPT = BANNED.replaceAll(': number', '').replaceAll(': boolean', '');
const ALLOWED_JAVASCRIPT = ALLOWED.replaceAll(': number', '').replaceAll(': boolean', '');

function expectedIn(files: string[]): string[] {
  return files
    .flatMap((file) => BANNED_LINES.map((line) => `${file}:${String(line)}`))
    .sort((left, right) => left.localeCompare(right));
}

function caseFor(javascript: boolean, extension: string, banned: string, allowed: string) {
  return bannedAndAllowedCase({
    javascript,
    extension,
    banned,
    allowed,
    expectedFor: (files) => expectedIn(files),
  });
}

describeEngineParity({
  title: 'operand slips',
  itTitle: 'reports each slip in production and test files on both engines',
  rule: 'nitpicker/no-operand-slip',
  prefix: 'nitpicker-operand-slip-',
  policy: 'logic',
  environment: process.env,
  typeAwareFallback: false,
  cases: [
    caseFor(false, 'ts', BANNED, ALLOWED),
    caseFor(true, 'mjs', BANNED_JAVASCRIPT, ALLOWED_JAVASCRIPT),
  ],
});
