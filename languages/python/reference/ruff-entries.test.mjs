import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readRuffSnapshot } from './ruff-entries.mjs';
import { isOlderVersion, isPresetRule } from './ruff-selection.mjs';

const PINNED_RUFF = /^ruff==(\S+)$/mu;

describe('the ruff snapshot of the rule reference', () => {
  it('comes from the ruff the Python e2e suite pins', () => {
    const constraints = readFileSync(
      new URL('../../../.github/python-e2e-constraints.txt', import.meta.url),
      'utf8',
    );

    expect(readRuffSnapshot().version).toBe(PINNED_RUFF.exec(constraints)[1]);
  });

  it('holds only rules the ruff config of the preset selects', () => {
    expect(readRuffSnapshot().rules.filter(({ code }) => !isPresetRule(code))).toEqual([]);
  });
});

describe('isOlderVersion', () => {
  it('compares dotted versions part by part as numbers', () => {
    expect(isOlderVersion('0.16.8', '0.16.10')).toBe(true);
    expect(isOlderVersion('0.16.10', '0.16.8')).toBe(false);
    expect(isOlderVersion('0.16.8', '0.16.8')).toBe(false);
    expect(isOlderVersion('0.16', '0.16.1')).toBe(true);
  });
});
