import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ruleEntry } from '../../../../shared/reference/entry.mjs';
import { wordsOfCamelCase } from '../../../../shared/reference/words.mjs';
import { ONE_WAY_RULES } from '../../adapters/kotlin/rules/kotlin-rules.mjs';

const DEFAULTS_FILE = new URL('../../detekt/detekt-default-rules.json', import.meta.url);
const NITPICKER_CONFIG = new URL('../../detekt/nitpicker-detekt.yml', import.meta.url);
const DETEKT_RULES_URL = 'https://detekt.dev/docs/rules';
const GUIDE = { label: 'Kotlin preset guide', path: 'docs/kotlin-preset.md' };

const DEFAULT_WHY =
  "One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.";
const ONE_WAY_WHY =
  "A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.";

export function nitpickerDetektRules() {
  const config = createRequire(import.meta.url)('yaml').parse(
    readFileSync(NITPICKER_CONFIG, 'utf8'),
  );
  return Object.entries(config).flatMap(([ruleset, body]) =>
    Object.entries(body)
      .filter(([, value]) => typeof value === 'object' && !Array.isArray(value) && value.active)
      .map(([rule]) => ({ ruleset, rule })),
  );
}

function detektEntry({ ruleset, rule }, oneWay) {
  const hint = ONE_WAY_RULES.find((candidate) => candidate.id === `detekt.${ruleset}.${rule}`);
  return ruleEntry({
    tool: 'detekt',
    rule: `detekt.${ruleset}.${rule}`,
    page: 'kotlin-detekt',
    analyzers: { kotlin: ['kotlin'] },
    builds: ['gradle', 'maven'],
    summary: wordsOfCamelCase(rule),
    why: oneWay ? ONE_WAY_WHY : DEFAULT_WHY,
    ...(hint?.allowed === undefined ? {} : { allowed: hint.allowed }),
    links: [{ label: 'detekt rule', url: `${DETEKT_RULES_URL}/${ruleset}#${rule.toLowerCase()}` }],
    docs: [oneWay ? { ...GUIDE, anchor: 'one-way-rules' } : GUIDE],
    exception: { key: 'exceptions', rule: `detekt.${ruleset}.${rule}` },
  });
}

/** The entries of the detekt rules the Kotlin preset runs: detekt's defaults and nitpicker's one-way rules. */
export function detektEntries() {
  const defaults = JSON.parse(readFileSync(DEFAULTS_FILE, 'utf8'));
  const pinned = nitpickerDetektRules();
  const pinnedIds = new Set(pinned.map(({ ruleset, rule }) => `${ruleset}.${rule}`));
  const byDefault = Object.entries(defaults.active)
    .flatMap(([ruleset, rules]) => rules.map((rule) => ({ ruleset, rule })))
    .filter(({ ruleset, rule }) => !pinnedIds.has(`${ruleset}.${rule}`));
  return [
    ...byDefault.map((rule) => detektEntry(rule, false)),
    ...pinned.map((rule) => detektEntry(rule, true)),
  ];
}
