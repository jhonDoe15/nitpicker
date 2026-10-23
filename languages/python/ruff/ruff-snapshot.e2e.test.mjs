import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RUFF_SELECT } from '../adapters/configuration/python-rule-ids.mjs';
import { installedRuffRules } from '../reference/ruff-selection.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';

function identities(rules) {
  return new Map(rules.map(({ code, name, linter }) => [code, `${name} (${linter})`]));
}

describe.skipIf(!enabled)('the ruff rule snapshot of the rule reference', () => {
  const snapshot = identities(
    JSON.parse(readFileSync(new URL('./ruff-rules.json', import.meta.url), 'utf8')),
  );
  const installed = identities(installedRuffRules(process.env.NITPICKER_RUFF ?? 'ruff'));

  it('has every rule of the installed ruff that the preset selects (run npm run gen:rules -- --refresh-ruff)', () => {
    expect(installed.size).toBeGreaterThan(0);
    expect([...installed].filter(([code, identity]) => snapshot.get(code) !== identity)).toEqual(
      [],
    );
  });

  it('has no other rule than one the config selects by code that a newer ruff added', () => {
    expect(
      [...snapshot.keys()].filter((code) => !installed.has(code) && !RUFF_SELECT.includes(code)),
    ).toEqual([]);
  });
});
