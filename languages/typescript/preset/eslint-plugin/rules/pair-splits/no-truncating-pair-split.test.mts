import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-truncating-pair-split.mts';

const tester = typescriptRuleTester();

function flagged(code: string, separator = ':') {
  return { code, errors: [{ messageId: 'truncatedPair', data: { separator } }] };
}

tester.run('no-truncating-pair-split', rule, {
  valid: [
    'export const [key, ...rest] = text.split(":");',
    'export const [a, b, c] = text.split(":");',
    'export const [first] = text.split(":");',
    'export const first = text.split(":")[0];',
    'export const parts = text.split(":"); export const [a, b] = parts;',
    'export const [hours, minutes] = value.split(":");',
    'export const [h, m] = value.split(":").map(Number);',
    'export const [start, end] = timeRange.split(":");',
    'export const [a, b] = "k:v".split(":");',
    'const SPEC = "x=1"; export const [a, b] = SPEC.split("=");',
    'export const [a, b] = text.split("/");',
    'export const [type, params] = contentType.split(";");',
    'export const [a, b] = text.split(/:/);',
    'export const [a, b] = text.split();',
    'export const [a, b] = text.split(sep);',
    'export const second = text.split(":")[2];',
    'export const i = text.indexOf(":"); export const value = text.slice(i + 1);',
    'export const [a, b] = text.partition(":");',
    'export const second = list[1];',
    'export const [key, value] = text.slice(1).split(":", 2).concat();',
    'export const on = (row: string) => row.split("=")[1] === "true";',
    'export const on = (row: string) => "yes" !== row.split(":")[1];',
    'export function scope(arg: string) { return arg.startsWith("--scope=") ? arg.split("=")[1] : ""; }',
    'export function scope(parts: string[]) { return parts[1].startsWith("--scope=") ? parts[1].split("=")[1] : ""; }',
  ],
  invalid: [
    flagged('export const on = (row: string) => row.split("=")[1] ?? "";', '='),
    flagged(
      'export function f(a: string, b: string) { return a.startsWith("x=") ? b.split("=")[1] : ""; }',
      '=',
    ),
    flagged(
      'export function f(a: string) { return a.startsWith("x:") ? a.split("=")[1] : ""; }',
      '=',
    ),
    flagged('export const [intro, errors] = message.split(":");'),
    flagged('export const [key, value] = line.split("=");', '='),
    flagged('export const [key, value] = line.split(":", 2);'),
    flagged('export const [key, value] = (line as string).split(":");'),
    flagged('export const [key, value] = line?.split(":") ?? [];'),
    flagged('export const [key, value = ""] = line.split(":");'),
    flagged('export const [, value] = line.split(":");'),
    flagged('let key, value; [key, value] = line.split(":");'),
    flagged('export const value = param.split("=")[1];', '='),
    flagged('export const value = header.split(":")[1].trim();'),
    flagged('export const value = header.split(":")?.[1];'),
    flagged('const SEP = ":"; export const [key, value] = line.split(SEP);'),
    flagged(
      'export function parse(pair: string) { const [name, secret] = pair.split("="); return name + secret; }',
      '=',
    ),
    flagged('export const [key, value] = `${prefix}${line}`.split(":");'),
  ],
});
