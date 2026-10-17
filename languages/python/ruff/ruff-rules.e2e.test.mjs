import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { RUFF_CONFIG, isStableRule } from '../adapters/configuration/python-ruff-config.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const ruff = process.env.NITPICKER_RUFF ?? 'ruff';

function stableRuffRules() {
  const result = spawnSync(ruff, ['rule', '--all', '--output-format', 'json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(result.stdout)
    .filter((rule) => rule.code?.startsWith('RUF') && isStableRule(rule))
    .map((rule) => rule.code);
}

describe.skipIf(!enabled)('the RUF rules of the installed ruff', () => {
  it('are all selected or ignored in the preset, so a new stable rule is reviewed first', () => {
    const { lint } = createRequire(import.meta.url)('smol-toml').parse(
      readFileSync(RUFF_CONFIG, 'utf8'),
    );
    const reviewed = new Set([...lint.select, ...lint.ignore]);

    expect(stableRuffRules().filter((code) => !reviewed.has(code))).toEqual([]);
  });
});
