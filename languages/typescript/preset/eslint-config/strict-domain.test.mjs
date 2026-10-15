import { ESLint } from 'eslint';
import functional from 'eslint-plugin-functional';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../eslint-plugin/index.mjs';
import { afterAll, describe, expect, it } from 'vitest';
import { lintFixture } from '../failure-messages/harness.mjs';
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
    expect(messagesFor(domainFile, 'export const run = (xs: number[]) => xs.push(1);')).toEqual(
      expect.arrayContaining([expect.stringContaining('domain/ code does not mutate arrays')]),
    );
    const assign = (target) =>
      `export const run = (o: { readonly a: number }) => Object.assign(${target}, o);`;
    expect(messagesFor(domainFile, assign('o'))).toEqual([
      expect.stringContaining('domain/ code does not mutate objects'),
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

  it('does not apply outside domain/', () => {
    const code = 'let n = 1; for (const x of [1]) { n += x; } class A {}';
    expect(messagesFor('src/main/features/billing/adapters/db.ts', code)).toEqual([]);
    expect(messagesFor('src/main/shared/util.ts', code)).toEqual([]);
  });

  it('applies to nested domain files of every feature', () => {
    expect(messagesFor('src/main/features/other/domain/deep/x.ts', 'let n = 1;')).toHaveLength(1);
  });
});

const typedRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-domain-typed-'));
afterAll(() => rmSync(typedRoot, { recursive: true, force: true }));

async function typedFindings(code) {
  const eslint = new ESLint({
    cwd: typedRoot,
    overrideConfigFile: true,
    overrideConfig: [
      ...strictDomainConfig.map((entry) => ({ ...entry, files: ['**/*.ts'] })),
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: {
            projectService: { allowDefaultProject: ['*.ts'] },
            tsconfigRootDir: typedRoot,
          },
        },
        plugins: { functional, nitpicker: nitpickerRules },
        rules: domainTypeAwareFunctionalRules,
      },
    ],
  });
  const [result] = await eslint.lintText(code, { filePath: path.join(typedRoot, 'invoice.ts') });
  return result.messages.map(({ line, ruleId, message }) => ({
    line,
    ruleId,
    start: message.split(' ').slice(0, 2).join(' '),
  }));
}

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

    const findings = await typedFindings(code);

    expect(findings.filter(({ ruleId }) => ruleId.startsWith('functional/'))).toEqual([
      { line: 1, ruleId: 'functional/prefer-immutable-types', start: 'Variable should' },
      { line: 2, ruleId: 'functional/prefer-immutable-types', start: 'Parameter should' },
      { line: 2, ruleId: 'functional/prefer-immutable-types', start: 'Return type' },
      { line: 7, ruleId: 'functional/prefer-immutable-types', start: 'Return type' },
    ]);
  });

  it('reports each way a local could still be mutated', async () => {
    const code = [
      'export function run(ms: number, n: number): number {',
      '  const d = new Date(ms); d.setUTCHours(0);',
      '  const s = new Set<number>(); s.add(n); s.clear();',
      '  const m = new Map<number, number>(); m.set(1, n);',
      '  const t = new Uint8Array(4); t.set([1, 2]);',
      "  const a = [n]; a['push'](2);",
      '  Array.prototype.push.call(a, 3); a.push.bind(a)(4);',
      '  const o = { x: n }; ({ x: o.x } = { x: 2 });',
      "  Reflect.set(o, 'x', 2);",
      '  Set.prototype.add.call(s, 2);',
      '  return d.getTime() + s.size + m.size + t.length + a.length + o.x;',
      '}',
    ].join('\n');

    const lines = (await typedFindings(code)).map(({ line, ruleId }) => `${line} ${ruleId}`);

    expect(lines).toEqual([
      '2 nitpicker/no-mutating-method-in-domain',
      '3 nitpicker/no-mutating-method-in-domain',
      '3 nitpicker/no-mutating-method-in-domain',
      '4 nitpicker/no-mutating-method-in-domain',
      '5 nitpicker/no-mutating-method-in-domain',
      '6 no-restricted-syntax',
      '7 no-restricted-syntax',
      '7 no-restricted-syntax',
      '8 no-restricted-syntax',
      '9 no-restricted-syntax',
      '10 nitpicker/no-mutating-method-in-domain',
    ]);
  });

  it('accepts reads and fresh values built from them', async () => {
    const code = [
      'export function shift(ms: number, xs: readonly number[]): number {',
      '  const seen = new Set(xs);',
      '  const next = new Set([...seen, 1]);',
      '  const byId = new Map(xs.map((x) => [x, x] as const));',
      '  const day = new Date(ms).getUTCDate();',
      "  const params = { sort: 'asc' };",
      '  return next.size + byId.size + day + (seen.has(1) ? 1 : 0) + params.sort.length;',
      '}',
    ].join('\n');

    expect(await typedFindings(code)).toEqual([]);
  });
});
