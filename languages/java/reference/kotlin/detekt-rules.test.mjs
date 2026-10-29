import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detektEntries, nitpickerDetektRules } from './detekt-rules.mjs';

const DEFAULTS = JSON.parse(
  readFileSync(new URL('../../detekt/detekt-default-rules.json', import.meta.url), 'utf8'),
);
const INIT_SCRIPT = readFileSync(
  new URL('../../gradle/nitpicker.init.gradle', import.meta.url),
  'utf8',
);

describe('the detekt default rules', () => {
  it('are those of the detekt version the init script pins', () => {
    const pinned = /detekt\s*:\s*'([^']+)'/u.exec(INIT_SCRIPT)?.[1];

    expect(DEFAULTS.version).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(DEFAULTS.version).toBe(pinned);
  });
});

describe('detektEntries', () => {
  it('has one entry for each default rule and each rule nitpicker pins', () => {
    const entries = detektEntries();
    const ids = new Set(entries.map(({ rule }) => rule));
    const defaults = Object.entries(DEFAULTS.active).flatMap(([ruleset, rules]) =>
      rules.map((rule) => `detekt.${ruleset}.${rule}`),
    );
    const pinned = nitpickerDetektRules().map(({ ruleset, rule }) => `detekt.${ruleset}.${rule}`);

    expect(defaults.length).toBeGreaterThan(50);
    expect(pinned.length).toBeGreaterThan(0);
    expect([...defaults, ...pinned].filter((rule) => !ids.has(rule))).toEqual([]);
    expect(entries).toHaveLength(ids.size);
  });

  it('marks a pinned rule as one-way and a default rule as tunable', () => {
    const [pinned] = nitpickerDetektRules();
    const byRule = new Map(detektEntries().map((entry) => [entry.rule, entry]));

    expect(byRule.get(`detekt.${pinned.ruleset}.${pinned.rule}`).why).toMatch(
      /^(?:.+ )?A one-way rule: .+$/u,
    );
    expect(byRule.get('detekt.style.MagicNumber').why).toMatch(
      /^(?:.+ )?One of detekt's default rules\. .+$/u,
    );
  });
});
