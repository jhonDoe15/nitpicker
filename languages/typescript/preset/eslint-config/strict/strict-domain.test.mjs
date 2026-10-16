import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import functional from 'eslint-plugin-functional';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../eslint-plugin/index.mjs';
import { lintFixture } from '../../failure-messages/test-support/harness.mjs';
import { domainTypeAwareFunctionalRules, strictDomainConfig } from './strict-domain.mjs';

function messagesFor(filename, code) {
  return lintFixture({ config: strictDomainConfig, filename, code })
    .filter((m) => m.ruleId !== null)
    .map((m) => m.message);
}

const domainFile = 'src/main/features/billing/domain/invoice.ts';

describe('strict domain rules', () => {
  it('accept the allowed transforms and readonly data', () => {
    const code = `
type Line = { readonly price: number };
export function total(lines: readonly Line[]) {
  const prices = lines.map((line) => line.price).filter((price) => price > 0);
  const byPrice = Object.groupBy(prices, (price) => String(price));
  return Object.fromEntries(Object.entries(byPrice).flatMap(([key]) => [[key, 1]]));
}
`;
    expect(messagesFor(domainFile, code)).toEqual([]);
  });

  it('reports a mutation once, with the domain message', () => {
    expect(
      [
        ...new Set(messagesFor(domainFile, 'export const run = (xs: number[]) => xs.push(1);')),
      ].sort(),
    ).toEqual([
      'domain/ code does not mutate arrays: build a new array with map, filter, flatMap or spread (toSorted, toReversed and toSpliced instead of sort, reverse and splice).',
      'domain/ types are readonly: write readonly T[] (or a readonly tuple) instead of a mutable array type.',
    ]);
    const assign = (target) =>
      `export const run = (o: { readonly a: number }) => Object.assign(${target}, o);`;
    expect(messagesFor(domainFile, assign('o'))).toEqual([
      'domain/ code does not mutate objects: return a new object with spread, e.g. { ...value, field } (Object.assign is fine only onto a fresh object literal).',
    ]);
    expect(messagesFor(domainFile, assign('{}'))).toEqual([]);
  });

  it('reports a type predicate over unknown once, as an unknown parameter', () => {
    const code =
      "export function isRecord(value: unknown): value is Record<string, string> { return typeof value === 'object'; }";
    const ruleIds = lintFixture({ config: strictDomainConfig, filename: domainFile, code }).map(
      (m) => m.ruleId,
    );
    expect(ruleIds).toEqual(['nitpicker/no-unknown-in-domain']);
  });

  it('reports the clock and I/O reached through the global object or a renamed date library', () => {
    const cases = [
      'export const now = () => globalThis.Date.now();',
      'export const now = () => window.Date.now();',
      'export const label = () => Date();',
      'export const today = () => new globalThis.Date();',
      'export const roll = () => self.Math.random();',
      'export const load = (url: string) => globalThis.fetch(url);',
      "export const load = (url: string) => globalThis['fetch'](url);",
      "export const env = () => globalThis.process.env['A'];",
      "import d from 'dayjs'; export const today = () => d();",
      "import * as m from 'moment'; export const today = () => m();",
    ];
    for (const code of cases) {
      expect(messagesFor(domainFile, code), code).not.toEqual([]);
    }
    expect(
      messagesFor(
        domainFile,
        "import dayjs from 'dayjs'; export const parse = (s: string) => dayjs(s);",
      ),
    ).toEqual([]);
    expect(
      messagesFor(domainFile, 'export const at = (ms: number) => new Date(ms).getUTCHours();'),
    ).toEqual([]);
  });

  it('does not apply outside domain/', () => {
    const code = 'let n = 1; for (const x of [1]) { n += x; } class A {}';
    expect(messagesFor('src/main/features/billing/adapters/db.ts', code)).toEqual([]);
    expect(messagesFor('src/main/shared/util.ts', code)).toEqual([]);
  });

  it('applies to nested domain files of every feature', () => {
    expect(messagesFor('src/main/features/other/domain/deep/x.ts', 'let n = 1;')).toHaveLength(1);
  });
});

const typed = { root: '', eslint: undefined };

beforeAll(() => {
  typed.root = mkdtempSync(path.join(tmpdir(), 'nitpicker-domain-typed-'));
  typed.eslint = new ESLint({
    cwd: typed.root,
    overrideConfigFile: true,
    overrideConfig: [
      ...strictDomainConfig.map((entry) => ({ ...entry, files: ['**/*.ts'] })),
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: {
            projectService: { allowDefaultProject: ['*.ts'] },
            tsconfigRootDir: typed.root,
          },
        },
        plugins: { functional, nitpicker: nitpickerRules },
        rules: domainTypeAwareFunctionalRules,
      },
    ],
  });
});

afterAll(() => {
  rmSync(typed.root, { recursive: true, force: true });
});

describe('unknown through an imported alias', () => {
  it('follows a type alias imported from another file', async () => {
    writeFileSync(
      path.join(typed.root, 'json.ts'),
      'export type JsonObject = Readonly<Record<string, unknown>>;\nexport type Name = string;\n',
    );
    const code = [
      "import type { JsonObject, Name } from './json.js';",
      'export type Event = { readonly payload: JsonObject; readonly name: Name };',
    ].join('\n');

    expect(
      (await typedFindings(code))
        .filter(({ ruleId }) => ruleId === 'nitpicker/no-unknown-in-domain')
        .map(lineAndRule),
    ).toEqual(['2 nitpicker/no-unknown-in-domain']);
  });
});

async function typedFindings(code) {
  const filePath = path.join(typed.root, 'invoice.ts');
  const [result] = await typed.eslint.lintText(code, { filePath });
  return result.messages.map(({ line, ruleId, message }) => ({ line, ruleId, message }));
}

const lineAndRule = ({ line, ruleId }) => `${line} ${ruleId}`;

describe('readonly types and mutation of domain values', () => {
  it('checks parameters, return types and module values, not locals inside functions', async () => {
    const code = [
      'export const ids = [1, 2, 3];',
      'export function evens(xs: number[]): number[] {',
      '  const kept = xs.filter((x) => x % 2 === 0);',
      '  const seen = new Set(kept);',
      '  return [...seen];',
      '}',
      'export function copy(xs: readonly number[]) {',
      '  const out = [...xs];',
      '  return out;',
      '}',
    ].join('\n');

    const immutability = (await typedFindings(code))
      .filter(({ ruleId }) => ruleId === 'functional/prefer-immutable-types')
      .map(({ line, message }) => `${line} ${message.split(' ')[0]}`);

    expect(immutability).toEqual(['1 Variable', '2 Parameter', '2 Return', '7 Return']);
  });

  it('reports each way a local could still be mutated, once', async () => {
    const code = [
      'export function run<T extends Set<number>>(ms: number, n: number, rd: Readonly<Date>, make: () => T): number {',
      '  const d = new Date(ms); d.setUTCHours(0); rd.setTime(1);',
      '  const s = new Set<number>(); s.add(n); s.clear(); make().add(1);',
      "  const m = new Map<number, number>(); m.set(1, n); m['delete'](1);",
      '  const t = new Uint8Array(4); t.set([1, 2]); t.sort();',
      "  const a = [n]; a['push'](2); const k = 'pop'; a[k]();",
      '  Array.prototype.push.call(a, 3); a.push.bind(a)(4); const p = a.push;',
      '  const o = { x: n }; ({ x: o.x } = { x: 2 });',
      "  Reflect.set(o, 'x', 2); Reflect.apply(p, a, [5]);",
      '  [1, 2].map(s.add, s); Set.prototype.add.call(s, 2);',
      "  const q = new URLSearchParams(); q.append('a', 'b');",
      '  return d.getTime() + s.size + m.size + t.length + a.length + o.x + q.size;',
      '}',
    ].join('\n');

    const findings = await typedFindings(code);

    expect(
      findings
        .filter(({ ruleId }) => ruleId !== 'functional/prefer-immutable-types')
        .map(lineAndRule),
    ).toEqual([
      '1 no-restricted-syntax',
      '2 nitpicker/no-mutating-method-in-domain',
      '2 nitpicker/no-mutating-method-in-domain',
      '3 nitpicker/no-mutating-method-in-domain',
      '3 nitpicker/no-mutating-method-in-domain',
      '3 nitpicker/no-mutating-method-in-domain',
      '4 nitpicker/no-mutating-method-in-domain',
      '4 nitpicker/no-mutating-method-in-domain',
      '5 nitpicker/no-mutating-method-in-domain',
      '5 no-restricted-syntax',
      '6 nitpicker/no-mutating-method-in-domain',
      '6 nitpicker/no-mutating-method-in-domain',
      '7 no-restricted-syntax',
      '7 no-restricted-syntax',
      '7 nitpicker/no-mutating-method-in-domain',
      '8 no-restricted-syntax',
      '9 no-restricted-syntax',
      '9 no-restricted-syntax',
      '10 nitpicker/no-mutating-method-in-domain',
      '10 nitpicker/no-mutating-method-in-domain',
      '11 nitpicker/no-mutating-method-in-domain',
    ]);
    expect(findings.find(({ line }) => line === 11).message).toBe(
      'domain/ code does not mutate values, and URLSearchParams.append changes the value it is called on: build a new value instead, e.g. new Set([...set, x]), new Map([...map, [key, value]]), new Map(xs.map((x) => [x.id, x] as const)) or new Date(ms + delta). If this mutation is intended, add an exception for this rule in nitpicker.config.json.',
    );
  });

  it('accepts reads, fresh values and objects whose methods only share a name', async () => {
    const code = [
      'type Money = { readonly add: (a: number, b: number) => number };',
      'export function shift(ms: number, xs: readonly number[], money: Money): number {',
      '  const seen = new Set(xs);',
      '  const next = new Set([...seen, 1]);',
      '  const byId = new Map(xs.map((x) => [x, x] as const));',
      '  const day = new Date(ms).getUTCDate();',
      "  const params = { sort: 'asc' };",
      '  const total = money.add(next.size, byId.size);',
      '  return total + day + (seen.has(1) ? 1 : 0) + params.sort.length;',
      '}',
    ].join('\n');

    expect(await typedFindings(code)).toEqual([]);
  });
});
