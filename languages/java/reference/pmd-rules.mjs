import { readFileSync } from 'node:fs';
import { ruleEntry } from '../../../shared/reference/entry.mjs';
import { asSentence } from '../../../shared/reference/build/text.mjs';
import { guideCell, optionalGuideCell } from '../../../shared/reference/build/guide-tables.mjs';
import { springMessage } from '../adapters/kotlin/review-rules/spring/spring-messages.mjs';
import { KOTLIN_REVIEW_EXCEPTION_RULES } from '../adapters/kotlin/review-rules/review-rules.mjs';
import { REVIEW_TOOL } from '../adapters/kotlin/review-rules/review-finding.mjs';
import { JVM_ANALYZERS, JVM_BUILDS } from './catalog-rules.mjs';
import {
  ESCAPING_MESSAGE,
  ESCAPING_RULE,
} from '../adapters/kotlin/review-rules/tests/coroutines/escapes/escaping-launches.mjs';
import {
  CONTROL_FLOW_MESSAGE,
  CONTROL_FLOW_RULE,
} from '../adapters/kotlin/review-rules/tests/honesty/flow/assertion-flow.mjs';
import {
  DISABLED_MESSAGE,
  DISABLED_RULE,
} from '../adapters/kotlin/review-rules/tests/honesty/skipped-tests.mjs';
import {
  FOCUSED_MESSAGE,
  FOCUSED_RULE,
} from '../adapters/kotlin/review-rules/tests/honesty/focused-tests.mjs';

const GRADLE_DIRECTORY = new URL('../gradle/', import.meta.url);
const KOTLIN_GUIDE = 'docs/kotlin-preset.md';
const JAVA_GUIDE = 'docs/java-preset.md';
const KOTLIN_REVIEW_MESSAGES = {
  [ESCAPING_RULE]: ESCAPING_MESSAGE,
  [CONTROL_FLOW_RULE]: CONTROL_FLOW_MESSAGE,
  [DISABLED_RULE]: DISABLED_MESSAGE,
  [FOCUSED_RULE]: FOCUSED_MESSAGE,
};
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
const DOUBLED_QUOTE = /''/gu;

function readRuleset(file) {
  return readFileSync(new URL(file, GRADLE_DIRECTORY), 'utf8');
}

function messageText(raw) {
  return raw
    .replaceAll(ENTITY, (entity) => ENTITIES[entity])
    .replaceAll(QUOTED_BRACE, '$1')
    .replaceAll(DOUBLED_QUOTE, "'");
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
  const flags = optionalGuideCell(JAVA_GUIDE, `pmd/${rule}`, 'flags');
  return ruleEntry({
    tool: 'pmd',
    rule,
    page: 'java-pmd',
    analyzers: JVM_ANALYZERS,
    builds: JVM_BUILDS,
    summary: flags === undefined ? message : asSentence(flags),
    why: spring
      ? "One of nitpicker's Spring rules: it names the one form Spring code should take, and runs only when Spring is on the compile classpath."
      : 'A PMD rule nitpicker defines: it names one allowed form where the language offers several, and reports the other forms.',
    ...(flags === undefined ? {} : { allowed: message }),
    ...(springMessage(rule) === undefined
      ? {}
      : { [flags === undefined ? 'messageIn' : 'allowedIn']: { kotlin: springMessage(rule) } }),
    scope,
    exception: { key: 'exceptions', rule: `pmd/${rule}` },
  });
}

/**
 * The entries of the review rules only the Kotlin preset runs, printed as `pmd/<rule>` like the
 * Java rules they mirror, for the rules that `known` (the ids with an entry already) lacks.
 */
export function kotlinReviewEntries(known) {
  const prefix = `${REVIEW_TOOL}/`;
  return KOTLIN_REVIEW_EXCEPTION_RULES.filter((id) => id.startsWith(prefix) && !known.has(id)).map(
    (id) =>
      ruleEntry({
        tool: REVIEW_TOOL,
        rule: id.slice(prefix.length),
        page: 'kotlin-nitpicker',
        analyzers: { kotlin: ['kotlin'] },
        builds: JVM_BUILDS,
        summary: asSentence(guideCell(KOTLIN_GUIDE, id.slice(prefix.length), 'flags')),
        why: 'One of the review rules of the Kotlin preset, a scan of the Kotlin sources on the Node side; it prints as a PMD rule, like the Java rules it mirrors.',
        ...(KOTLIN_REVIEW_MESSAGES[id.slice(prefix.length)] === undefined
          ? {}
          : { allowed: KOTLIN_REVIEW_MESSAGES[id.slice(prefix.length)] }),
        exception: { key: 'exceptions', rule: id },
        docs: [{ label: 'Kotlin preset guide', path: KOTLIN_GUIDE, anchor: 'review-rules' }],
      }),
  );
}
