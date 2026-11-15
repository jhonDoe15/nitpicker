import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { RUFF_CONFIG } from '../adapters/configuration/python-ruff-config.mjs';
import type { RuffRule } from '../reference/typed/ruff-rule-views.mts';
import { isStableRuffRule, ruffSelection } from './typed/ruff-select.mts';
import { installedRuffRules } from './test-support/installed-ruff-rules.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const ruff = process.env['NITPICKER_RUFF'] ?? 'ruff';
const PREVIEW_SELECTIONS = new Set(['RUF071']);

describe.skipIf(!enabled)('the RUF rules of the installed ruff', () => {
  const lint = ruffSelection(readFileSync(RUFF_CONFIG, 'utf8'));
  let rules: RuffRule[];

  beforeAll(() => {
    rules = installedRuffRules(ruff);
  });

  it('are all selected or ignored in the preset, so a new stable rule is reviewed first', () => {
    const reviewed = new Set([...lint.select, ...lint.ignore]);
    const stableRuf = rules
      .filter((rule) => rule.code.startsWith('RUF') && isStableRuffRule(rule))
      .map((rule) => rule.code);

    expect(stableRuf.filter((code) => !reviewed.has(code))).toEqual([]);
  });

  it('select only codes that exist and are stable, or prefixes of stable codes', () => {
    const stable = rules.filter(isStableRuffRule).map((rule) => rule.code);
    const known = new Set(rules.map((rule) => rule.code));
    const unstable = lint.select.filter((code) =>
      known.has(code)
        ? !(stable.includes(code) || PREVIEW_SELECTIONS.has(code))
        : !stable.some((rule) => rule.startsWith(code)),
    );

    expect(unstable).toEqual([]);
  });
});
