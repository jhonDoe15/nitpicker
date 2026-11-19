import { typedTsProject } from '../../test-support/projects/typed-ts-project.mts';
import { rule } from './no-lossy-json-stringify.mts';

const project = typedTsProject('nitpicker-lossy-json-', { typeScriptOnly: true });

const PRELUDE = [
  'declare const id: bigint;',
  'declare const big: 10n | 20n;',
  'declare const map: Map<string, number>;',
  'declare const set: Set<string>;',
  'declare const pattern: RegExp;',
  'declare const params: (string | bigint)[];',
  'declare const row: { name: string; ids: bigint[] };',
  'declare const pair: [string, RegExp];',
  'declare const optional: { at?: bigint } | undefined;',
  'declare const record: Record<string, Set<number>>;',
  'declare const text: string;',
  'declare const anything: any;',
  'declare const unknownValue: unknown;',
  'declare const date: Date;',
  'declare const plain: { a: number; when: Date; tags: string[] };',
  'class Money { constructor(readonly cents: bigint) {} toJSON() { return String(this.cents); } }',
  'declare const money: Money;',
  'declare const moneys: Money[];',
  'class Holder { items = new Map<string, number>(); }',
  'declare const holder: Holder;',
  '',
].join('\n');

function typed(code: string) {
  return { filename: project.write(`${PRELUDE}${code}`, 'ts'), code: `${PRELUDE}${code}` };
}

function flagged(code: string, kind: string) {
  return { ...typed(code), errors: [{ messageId: 'lossy', data: { kind } }] };
}

project.tester.run('no-lossy-json-stringify', rule, {
  valid: [
    typed('JSON.stringify(text);'),
    typed('JSON.stringify([text, 1]);'),
    typed('JSON.stringify(plain);'),
    typed('JSON.stringify(date);'),
    typed('JSON.stringify(anything);'),
    typed('JSON.stringify(unknownValue);'),
    typed('JSON.stringify(String(id));'),
    typed('JSON.stringify([...map]);'),
    typed('JSON.stringify(Object.fromEntries(map));'),
    typed('JSON.stringify(money);'),
    typed('JSON.stringify(moneys);'),
    typed(`JSON.stringify(row, (_, v) => (typeof v === "bigint" ? \`\${v}n\` : v));`),
    typed('JSON.stringify(map, replacer);'),
    typed('JSON.stringify(row, ["name"]);'),
    typed('JSON.stringify(plain, null, 2).length;'),
    typed('stringify(id);'),
    typed('other.stringify(id);'),
  ],
  invalid: [
    flagged('JSON.stringify(id);', 'bigint'),
    flagged('JSON.stringify(big);', 'bigint'),
    flagged('JSON.stringify([text, params]);', 'bigint'),
    flagged('JSON.stringify(map);', 'Map'),
    flagged('JSON.stringify(set);', 'Set'),
    flagged('JSON.stringify(pattern);', 'RegExp'),
    flagged('JSON.stringify(row);', 'bigint'),
    flagged('JSON.stringify(pair);', 'RegExp'),
    flagged('JSON.stringify(optional);', 'bigint'),
    flagged('JSON.stringify(record);', 'Set'),
    flagged('JSON.stringify(holder);', 'Map'),
    flagged('JSON.stringify(row, null, 2);', 'bigint'),
    flagged('JSON.stringify({ key: pattern, n: 1 });', 'RegExp'),
  ],
});
