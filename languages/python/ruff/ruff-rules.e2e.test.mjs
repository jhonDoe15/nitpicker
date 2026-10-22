import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { RUFF_CONFIG, isStableRule } from '../adapters/configuration/python-ruff-config.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const ruff = process.env.NITPICKER_RUFF ?? 'ruff';
const PREVIEW_SELECTIONS = new Set(['RUF071']);

function installedRules() {
  const result = spawnSync(ruff, ['rule', '--all', '--output-format', 'json'], {
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout).filter((rule) => typeof rule.code === 'string');
}

describe.skipIf(!enabled)('the RUF rules of the installed ruff', () => {
  const { lint } = createRequire(import.meta.url)('smol-toml').parse(
    readFileSync(RUFF_CONFIG, 'utf8'),
  );
  let rules;

  beforeAll(() => {
    rules = installedRules();
  });

  it('are all selected or ignored in the preset, so a new stable rule is reviewed first', () => {
    const reviewed = new Set([...lint.select, ...lint.ignore]);
    const stableRuf = rules
      .filter((rule) => rule.code.startsWith('RUF') && isStableRule(rule))
      .map((rule) => rule.code);

    expect(stableRuf.filter((code) => !reviewed.has(code))).toEqual([]);
  });

  it('select only codes that exist and are stable, or prefixes of stable codes', () => {
    const stable = rules.filter(isStableRule).map((rule) => rule.code);
    const known = new Set(rules.map((rule) => rule.code));
    const unstable = lint.select.filter((code) =>
      known.has(code)
        ? !stable.includes(code) && !PREVIEW_SELECTIONS.has(code)
        : !stable.some((rule) => rule.startsWith(code)),
    );

    expect(unstable).toEqual([]);
  });
});
