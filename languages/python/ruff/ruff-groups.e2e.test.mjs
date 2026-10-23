import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { RUFF_CONFIG, isStableRule } from '../adapters/configuration/python-ruff-config.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const ruff = process.env.NITPICKER_RUFF ?? 'ruff';
const LISTED_GROUPS = /^(?:G|N|ERA|ARG|PT|S|TRY|FBT|DTZ)\d+$/u;
const DECLINED = new Set([
  'FBT003',
  'PT009',
  'PT027',
  'S101',
  'S103',
  'S104',
  'S105',
  'S106',
  'S107',
  'S110',
  'S112',
  'S310',
  'S311',
  'S601',
  'S603',
  'S606',
  'S607',
  'S608',
  'TRY003',
  'TRY300',
  'TRY301',
]);

function stableCodesOfListedGroups() {
  const result = spawnSync(ruff, ['rule', '--all', '--output-format', 'json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(result.stdout)
    .filter((rule) => LISTED_GROUPS.test(rule.code ?? '') && isStableRule(rule))
    .map((rule) => rule.code);
}

describe.skipIf(!enabled)('the grouped rules of the installed ruff', () => {
  const { lint } = createRequire(import.meta.url)('smol-toml').parse(
    readFileSync(RUFF_CONFIG, 'utf8'),
  );

  it('are all selected or declined in the preset, so a new stable rule is reviewed first', () => {
    const reviewed = new Set([...lint.select, ...DECLINED]);

    expect(stableCodesOfListedGroups().filter((code) => !reviewed.has(code))).toEqual([]);
  });

  it('never select a declined rule', () => {
    expect(lint.select.filter((code) => DECLINED.has(code))).toEqual([]);
  });
});
