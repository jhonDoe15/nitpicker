import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readConfigFile } from '../../../../core/configuration/config.mts';
import { fieldAt } from '../../../../scripts/json/fields.mts';
import {
  kotlinRuleAliasNotices,
  withKotlinRuleAliases as untypedWithKotlinRuleAliases,
} from './kotlin-options.mjs';

const withKotlinRuleAliases: (config: Record<string, unknown>) => Record<string, unknown> =
  untypedWithKotlinRuleAliases;

const roots: string[] = [];

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const OLD = {
  rule: 'kotlin-source/IoCallInLoop',
  paths: ['src/main/kotlin/shop/Import.kt'],
  reason: 'legacy',
};

function projectWith(config: Record<string, unknown>) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-alias-'));
  roots.push(root);
  writeFileSync(path.join(root, 'nitpicker.config.json'), JSON.stringify(config));
  return root;
}

describe('kotlin rule aliases', () => {
  it('reads the old kotlin-source loop rule as the effects rule and names the rename', () => {
    const config = { preset: 'kotlin', exceptions: [OLD, OLD] };

    expect(fieldAt(withKotlinRuleAliases(config), 'exceptions', 0)).toEqual({
      ...OLD,
      rule: 'effects/IoCallInLoop',
    });
    expect(kotlinRuleAliasNotices(config)).toEqual([
      'The exception rule "kotlin-source/IoCallInLoop" is now "effects/IoCallInLoop": nitpicker reads the old name for now; rename it in nitpicker.config.json.',
    ]);
  });

  it('accepts the old key in the config file of a Kotlin project only', () => {
    const kotlin: unknown = readConfigFile(projectWith({ preset: 'kotlin', exceptions: [OLD] }));

    expect(fieldAt(kotlin, 'exceptions', 0, 'rule')).toBe('effects/IoCallInLoop');
    expect(
      fieldAt(withKotlinRuleAliases({ preset: 'java', exceptions: [OLD] }), 'exceptions', 0),
    ).toBe(OLD);
    expect(kotlinRuleAliasNotices({ preset: 'kotlin' })).toEqual([]);
  });
});
