import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fieldOf, fieldsOf, isPlainObject } from '../../../../shared/values/readers.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { JVM_BUILDS } from '../catalog-rules.mts';
import { flatText, ruleEntry, splitFirstSentence } from '../typed/entry-views.mts';
import type { RuleEntry } from '../typed/entry-views.mts';
import type { DetektText, ToolText } from '../typed/tool-text-types.mts';
import { readToolText } from '../tool-text/tool-text.mts';
import { ONE_WAY_RULES } from '../../adapters/kotlin/rules/kotlin-rules.mts';

type DetektRule = { ruleset: string; rule: string };
type OneWayRule = { id: string; allowed?: string };
type Defaults = { version: string; active: Record<string, string[]> };

const parseDefaults: (text: string) => Defaults = JSON.parse;
const oneWayRules: readonly OneWayRule[] = ONE_WAY_RULES;

const DEFAULTS_FILE = new URL('./detekt-default-rules.json', import.meta.url);
const NITPICKER_CONFIG = new URL('../../detekt/nitpicker-detekt.yml', import.meta.url);
const DETEKT_RULES_URL = 'https://detekt.dev/docs/rules';
const GUIDE = { label: 'Kotlin preset guide', path: 'docs/kotlin-preset.md' };

const DEFAULT_WHY =
  "One of detekt's default rules. The Kotlin preset builds upon detekt's defaults, so a rule that is on by default is part of the one way, and a project's detekt config can tune it but only nitpicker's own file can pin it.";
const ONE_WAY_WHY =
  "A one-way rule: nitpicker's detekt file turns it on and pins it, so a project cannot switch it off, lower its severity or exclude paths in detekt.yml. It narrows a spot where Kotlin offers several ways to the one allowed form.";

export function nitpickerDetektRules(): DetektRule[] {
  const yaml: unknown = createRequire(import.meta.url)('yaml');
  const config = fieldsOf(
    callUntyped(fieldOf(yaml, 'parse'), readFileSync(NITPICKER_CONFIG, 'utf8')),
  );
  return Object.entries(config).flatMap(([ruleset, body]) =>
    Object.entries(fieldsOf(body))
      .filter(([, value]) => isPlainObject(value) && Boolean(fieldOf(value, 'active')))
      .map(([rule]) => ({ ruleset, rule })),
  );
}

function detektText(
  ruleset: string,
  rule: string,
  texts: ToolText<DetektText>,
): { first: string | undefined; rest: string | undefined } {
  const text = texts.rules[`${ruleset}.${rule}`];
  if (text === undefined) {
    throw new Error(`The detekt ${texts.version} snapshot has no rule ${ruleset}.${rule}`);
  }
  return splitFirstSentence(flatText(text.description));
}

function detektEntry(
  { ruleset, rule }: DetektRule,
  oneWay: boolean,
  texts: ToolText<DetektText>,
): RuleEntry {
  const hint = oneWayRules.find((candidate) => candidate.id === `detekt.${ruleset}.${rule}`);
  const { first, rest } = detektText(ruleset, rule, texts);
  return ruleEntry({
    tool: 'detekt',
    rule: `detekt.${ruleset}.${rule}`,
    page: 'kotlin-detekt',
    analyzers: { kotlin: ['kotlin'] },
    builds: JVM_BUILDS,
    summary: first,
    why: [rest, oneWay ? ONE_WAY_WHY : DEFAULT_WHY].filter((part) => part !== '').join(' '),
    ...(hint?.allowed === undefined ? {} : { allowed: hint.allowed }),
    links: [{ label: 'detekt rule', url: `${DETEKT_RULES_URL}/${ruleset}#${rule.toLowerCase()}` }],
    docs: [oneWay ? { ...GUIDE, anchor: 'one-way-rules' } : GUIDE],
    exception: { key: 'exceptions', rule: `detekt.${ruleset}.${rule}` },
  });
}

export function detektEntries(): RuleEntry[] {
  const defaults = parseDefaults(readFileSync(DEFAULTS_FILE, 'utf8'));
  const texts = readToolText('detekt');
  const pinned = nitpickerDetektRules();
  const pinnedIds = new Set(pinned.map(({ ruleset, rule }) => `${ruleset}.${rule}`));
  const byDefault = Object.entries(defaults.active)
    .flatMap(([ruleset, rules]) => rules.map((rule) => ({ ruleset, rule })))
    .filter(({ ruleset, rule }) => !pinnedIds.has(`${ruleset}.${rule}`));
  return [
    ...byDefault.map((rule) => detektEntry(rule, false, texts)),
    ...pinned.map((rule) => detektEntry(rule, true, texts)),
  ];
}
