import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyInventoryToFindings,
  compareSignals,
  readOptionalInventory,
  withLegacyInventory,
} from './legacy-inventory.mjs';
import { evaluateBaselineExpansions } from './rules/baseline-expansion.mjs';

const site = (count, source = 's') => ({ file: 'a.java', rule: 'r', source, count });
const finding = (identity, classification = 'enforceable') => ({
  tool: 'pmd',
  path: 'a.java',
  rule: 'r',
  identity,
  classification,
});

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('legacy inventory', () => {
  it('reports signals beyond their allowance', () => {
    const signals = [site(1), site(1), site(1, 'other')].map(({ count, ...rest }) => rest);

    expect(compareSignals(signals, [site(2)])).toEqual([
      expect.objectContaining({ source: 'other', count: 1 }),
    ]);
    expect(compareSignals(signals, [site(1)])).toHaveLength(2);
  });

  it('reads a missing inventory as empty and rejects malformed JSON', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-inventory-'));
    roots.push(root);
    expect(readOptionalInventory(root, 'nitpicker.legacy.json')).toEqual({ sites: [] });
    writeFileSync(path.join(root, 'nitpicker.legacy.json'), '{');
    expect(() => readOptionalInventory(root, 'nitpicker.legacy.json')).toThrow(
      /Invalid legacy inventory/,
    );
  });

  it('flags a raised allowance and a new site, not a lowered or unchanged one', () => {
    expect(evaluateBaselineExpansions([site(2)], [site(2)], 't')).toEqual([]);
    expect(evaluateBaselineExpansions([site(2)], [site(1)], 't')).toEqual([]);
    expect(evaluateBaselineExpansions([site(1)], [site(3)], 't')).toEqual([
      expect.objectContaining({
        tool: 't',
        rule: 'baseline-expansion',
        path: 'a.java',
        classification: 'enforceable',
        message: 'Legacy allowance increased from 1 to 3 for r',
      }),
    ]);
    expect(evaluateBaselineExpansions([], [site(1)], 't')).toHaveLength(1);
    expect(() => evaluateBaselineExpansions([], [site(0)], 't')).toThrow(/positive integers/);
  });

  it('baselines up to the allowance and keeps the rest and report-only findings', () => {
    const findings = [
      finding('s'),
      finding('s'),
      finding('s'),
      finding('other'),
      finding('s', 'report-only'),
    ];

    expect(applyInventoryToFindings(findings, [site(2)])).toEqual([
      findings[2],
      findings[3],
      findings[4],
    ]);
  });
});

describe('withLegacyInventory', () => {
  const sha256 = (...parts) =>
    parts.reduce((hash, part) => hash.update(part), createHash('sha256')).digest('hex');
  const analyzer = {
    configurationHash: 'package',
    resolveConfigurationHash: (root) => `resolved:${path.basename(root)}`,
    createInvocation: () => ({ args: [] }),
  };

  it("chains the analyzer's own resolved hash with the inventory file, once per wrap", () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-inventory-hash-'));
    roots.push(root);
    const wrapped = withLegacyInventory(analyzer, 'legacy.json');
    const resolved = `resolved:${path.basename(root)}`;

    expect(wrapped.resolveConfigurationHash(root)).toBe(resolved);
    writeFileSync(path.join(root, 'legacy.json'), '{"sites":[]}');
    expect(wrapped.resolveConfigurationHash(root)).toBe(sha256(resolved, '{"sites":[]}'));
    expect(withLegacyInventory(wrapped, 'legacy.json').resolveConfigurationHash(root)).toBe(
      sha256(resolved, '{"sites":[]}'),
    );
  });
});
