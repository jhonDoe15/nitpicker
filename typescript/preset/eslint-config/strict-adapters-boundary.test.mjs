import { describe, expect, it } from 'vitest';
import { lintFixture } from '../failure-messages/harness.mjs';
import strictAdaptersConfig from './strict-adapters.mjs';

const adapterFile = 'src/main/features/billing/adapters/http.ts';

function ruleIds(filename, code) {
  return lintFixture({ config: strictAdaptersConfig, filename, code })
    .filter((m) => m.ruleId !== null)
    .map((m) => m.ruleId);
}

describe('strict adapters boundary guard rule', () => {
  it.each([
    ['direct schema.parse', 'const v = schema.parse(JSON.parse(text));'],
    ['safeParse', 'const v = Invoice.safeParse(JSON.parse(text));'],
    ['variable later parsed', 'const raw = JSON.parse(text); const v = schema.parse(raw);'],
    ['parseAsync', 'const raw = JSON.parse(text); await schema.parseAsync(raw);'],
    ['no type guards', 'function total(value: Invoice): number { return value.total; }'],
  ])('allows %s', (_name, code) => {
    expect(ruleIds(adapterFile, code)).toEqual([]);
  });

  it.each([
    ['guard method in a type', 'type Guards = { is(v: unknown): v is Invoice };'],
    ['arrow guard', 'const isInvoice = (v: unknown): v is Invoice => true;'],
    ['cast without parse', 'const v = JSON.parse(text) as Invoice;'],
    ['variable never parsed', 'const raw = JSON.parse(text); use(raw);'],
    ['parse of an unrelated value', 'const raw = JSON.parse(text); schema.parse(other);'],
    ['assignment instead of declaration', 'let raw; raw = JSON.parse(text);'],
  ])('flags %s', (_name, code) => {
    expect(ruleIds(adapterFile, code)).toEqual(['nitpicker/no-handwritten-boundary-guard']);
  });

  it('does not apply outside adapters/', () => {
    const code = 'const v = JSON.parse(text); const g = (x: unknown): x is Invoice => true;';
    expect(ruleIds('src/main/features/billing/domain/x.ts', code)).toEqual([]);
  });
});
