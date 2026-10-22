import { readFileSync } from 'node:fs';
import { ruleEntry } from '../../../shared/reference/entry.mjs';
import { wordsOfCamelCase } from '../../../shared/reference/words.mjs';
import { JVM_ANALYZERS, JVM_BUILDS } from './catalog-rules.mjs';

const GRADLE_DIRECTORY = new URL('../gradle/', import.meta.url);
const NITPICKER_RULESET = 'pmd-ruleset.xml';
const OWN_RULESETS = [
  { file: NITPICKER_RULESET, scope: 'Main and test sources.' },
  { file: 'pmd-main-ruleset.xml', scope: 'Main sources only.' },
  { file: 'pmd-test-ruleset.xml', scope: 'Test sources only.' },
  {
    file: 'spring-ruleset.xml',
    scope: 'Main sources of a project with Spring on the compile classpath.',
    spring: true,
  },
  {
    file: 'spring-test-ruleset.xml',
    scope: 'Test sources of a project with Spring on the compile classpath.',
    spring: true,
  },
];
const CATEGORY_BLOCK = /<rule\s+ref="category\/java\/\w+\.xml">([\s\S]*?)<\/rule>/gu;
const EXCLUDED_RULE = /<exclude\s+name="(\w+)"/gu;
const NAMED_REFERENCE = /<rule\s+ref="category\/java\/\w+\.xml\/(\w+)"/gu;
const OWN_RULE = /<rule\s+name="(\w+)"[^>]*?\smessage="([^"]*)"/gu;
const ENTITIES = { '&quot;': '"', '&lt;': '<', '&gt;': '>', '&apos;': "'", '&amp;': '&' };
const ENTITY = /&(?:quot|lt|gt|apos|amp);/gu;
const QUOTED_BRACE = /'(\{|\})'/gu;

function readRuleset(file) {
  return readFileSync(new URL(file, GRADLE_DIRECTORY), 'utf8');
}

function messageText(raw) {
  return raw.replaceAll(ENTITY, (entity) => ENTITIES[entity]).replaceAll(QUOTED_BRACE, '$1');
}

function matchesOf(expression, text) {
  return [...text.matchAll(expression)];
}

/** The rules of PMD's own categories that the nitpicker rulesets leave out. */
export function leftOutPmdRules() {
  const ruleset = readRuleset(NITPICKER_RULESET);
  const excluded = matchesOf(CATEGORY_BLOCK, ruleset).flatMap(([, body]) =>
    matchesOf(EXCLUDED_RULE, body).map((match) => match[1]),
  );
  const named = new Set(
    OWN_RULESETS.flatMap(({ file }) =>
      matchesOf(NAMED_REFERENCE, readRuleset(file)).map((match) => match[1]),
    ),
  );
  return excluded.filter((rule) => !named.has(rule));
}

/** The PMD rules nitpicker defines in its own rulesets, with the message each prints. */
export function ownPmdRules() {
  return OWN_RULESETS.flatMap(({ file, scope, spring }) =>
    matchesOf(OWN_RULE, readRuleset(file)).map(([, rule, message]) => ({
      rule,
      scope,
      spring: spring === true,
      message: messageText(message),
    })),
  );
}

/** The entry of a rule nitpicker defines in its PMD rulesets. */
export function ownPmdEntry({ rule, scope, spring, message }) {
  return ruleEntry({
    tool: 'pmd',
    rule,
    page: 'java-pmd',
    analyzers: JVM_ANALYZERS,
    builds: JVM_BUILDS,
    summary: wordsOfCamelCase(rule),
    why: spring
      ? "One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath."
      : 'A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.',
    allowed: message,
    scope,
    exception: { key: 'exceptions', rule: `pmd/${rule}` },
  });
}
