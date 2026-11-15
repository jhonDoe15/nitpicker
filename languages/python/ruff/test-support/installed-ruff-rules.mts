import { spawnSync } from 'node:child_process';
import { expect } from 'vitest';
import { parseRuffRules } from '../../reference/typed/ruff-rule-views.mts';
import type { RuffRule } from '../../reference/typed/ruff-rule-views.mts';

const LIST_TIMEOUT_MS = 10_000;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const MAX_LISTING_MEGABYTES = 64;

export function installedRuffRules(ruff: string): RuffRule[] {
  const result = spawnSync(ruff, ['rule', '--all', '--output-format', 'json'], {
    encoding: 'utf8',
    timeout: LIST_TIMEOUT_MS,
    maxBuffer: MAX_LISTING_MEGABYTES * BYTES_PER_MEGABYTE,
  });
  expect(result.status, result.stderr).toBe(0);
  return parseRuffRules(result.stdout).filter((rule) => typeof rule.code === 'string');
}
