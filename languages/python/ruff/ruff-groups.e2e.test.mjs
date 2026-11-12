import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { RUFF_CONFIG, isStableRule } from '../adapters/configuration/python-ruff-config.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const ruff = process.env.NITPICKER_RUFF ?? 'ruff';
const LISTED_GROUPS = /^(?:G|N|ERA|ARG|PT|S|TRY|FBT|ASYNC|DTZ|LOG|PLE|PLW|T10)\d+$/u;
const DECLINED = new Set([
  'FBT001',
  'FBT002',
  'FBT003',
  'PLE0116',
  'PLE1132',
  'PLE1300',
  'PLE1307',
  'PLE1310',
  'PLW0711',
  'PLW1641',
  'PT004',
  'PT005',
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
  'S320',
  'S410',
  'S601',
  'S603',
  'S606',
  'S607',
  'S608',
  'TRY003',
  'TRY200',
  'TRY300',
  'TRY301',
]);

function stableCodesOfListedGroups() {
  const result = spawnSync(ruff, ['rule', '--all', '--output-format', 'json'], {
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  expect(result.status, result.stderr).toBe(0);
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
