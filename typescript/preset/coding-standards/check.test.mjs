import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectSignals, compareSignals, readLegacyInventory } from './check.mjs';

const legacy = { file: 'src/main/legacy.ts', rule: 'internal-mock', source: 'vi.mock(helper)' };
describe('coding standards gate', () => {
  it('runs the actual configured rules against a new module and accepts its repaired behavior', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'coding-standards-fixture-'));
    try {
      mkdirSync(path.join(root, 'preset'), { recursive: true });
      symlinkSync(
        path.resolve(import.meta.dirname, '../eslint-config'),
        path.join(root, 'preset/eslint-config'),
      );
      mkdirSync(path.join(root, 'src/main/__tests__'), { recursive: true });
      mkdirSync(path.join(root, 'tests'), { recursive: true });
      writeFileSync(path.join(root, 'src/main/helper.ts'), 'export const value = 1;');
      const subject = path.join(root, 'src/main/__tests__/consumer.test.ts');
      const runtimeTest = path.join(root, 'tests/consumer.test.ts');
      writeFileSync(runtimeTest, 'export {};');
      writeFileSync(
        subject,
        "import { vi, it } from 'vitest'; vi.mock('../helper.js'); it('polls', async () => { vi.useFakeTimers(); await vi.waitFor(() => {}); });",
      );
      const signals = await collectSignals(root);
      expect(signals.map((item) => item.rule).sort()).toEqual([
        'nitpicker/no-internal-module-mocks',
        'nitpicker/no-wait-for-with-fake-timers',
      ]);
      expect(compareSignals(signals, [])).toHaveLength(2);
      writeFileSync(
        subject,
        "import { vi, it, expect } from 'vitest'; import { value } from '../helper.js'; it('completes', async () => { vi.useFakeTimers(); await vi.advanceTimersByTimeAsync(1); expect(value).toBe(1); });",
      );
      expect(await collectSignals(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('permits an unchanged legacy site and its removal', () => {
    expect(compareSignals([legacy], [{ ...legacy, count: 1 }])).toEqual([]);
    expect(compareSignals([], [{ ...legacy, count: 1 }])).toEqual([]);
  });
  it('rejects the same behavior in a new module', () => {
    expect(
      compareSignals([{ ...legacy, file: 'src/main/new.ts' }], [{ ...legacy, count: 1 }]),
    ).toHaveLength(1);
  });
  it('rejects another occurrence even when its normalized source is identical', () => {
    expect(compareSignals([legacy, legacy], [{ ...legacy, count: 1 }])).toEqual([
      { ...legacy, count: 2 },
    ]);
  });
  it('rejects a changed mocked target rather than trading it for an old allowance', () => {
    expect(
      compareSignals([{ ...legacy, source: 'vi.mock(other)' }], [{ ...legacy, count: 1 }]),
    ).toHaveLength(1);
  });
  it('treats a missing legacy inventory as allowing no sites', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'coding-standards-inventory-'));
    try {
      const inventory = readLegacyInventory(path.join(root, 'nitpicker.legacy.json'));
      expect(inventory).toEqual({ sites: [] });
      expect(compareSignals([legacy], inventory.sites)).toEqual([{ ...legacy, count: 1 }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('allows exactly the sites listed in a present legacy inventory', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'coding-standards-inventory-'));
    try {
      const inventoryPath = path.join(root, 'nitpicker.legacy.json');
      writeFileSync(inventoryPath, JSON.stringify({ sites: [{ ...legacy, count: 1 }] }));
      const inventory = readLegacyInventory(inventoryPath);
      expect(compareSignals([legacy], inventory.sites)).toEqual([]);
      expect(compareSignals([legacy, legacy], inventory.sites)).toEqual([{ ...legacy, count: 2 }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('rejects a malformed legacy inventory instead of treating it as empty', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'coding-standards-inventory-'));
    try {
      const inventoryPath = path.join(root, 'nitpicker.legacy.json');
      writeFileSync(inventoryPath, '{ not json');
      expect(() => readLegacyInventory(inventoryPath)).toThrow(SyntaxError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
