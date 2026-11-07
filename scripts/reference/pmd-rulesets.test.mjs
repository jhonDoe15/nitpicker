import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pmdRulesetSources } from './pmd-rulesets.mjs';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..');

describe('the PMD rulesets', () => {
  it('are built from one file per rule, so two new rules never edit the same lines of a fragment', () => {
    const sources = pmdRulesetSources(REPOSITORY_ROOT);

    expect([...sources.keys()]).toEqual(
      [
        'pmd-main-ruleset',
        'pmd-ruleset',
        'pmd-test-ruleset',
        'spring-ruleset',
        'spring-test-ruleset',
      ].map((name) => `languages/java/gradle/${name}.xml`),
    );
    expect(
      [...sources]
        .filter(([file, text]) => readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8') !== text)
        .map(([file]) => file),
    ).toEqual([]);
  });
});
