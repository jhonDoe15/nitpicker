import { counterpartsOf, ruleEntry } from '../typed/entry-views.mts';
import type { RuleEntry } from '../typed/entry-views.mts';
import { JVM_ANALYZERS, JVM_BUILDS } from '../catalog-rules.mts';
import { VALUE_CHECKS } from '../../adapters/review-rules/value-checks/value-checks.mts';
import { VALUE_CHECK_TEXTS } from './value-check-texts.mts';

function entryOf({ rule, allowed }: { rule: string; allowed: string }): RuleEntry {
  const text = VALUE_CHECK_TEXTS[rule];
  if (text === undefined) {
    throw new Error(`No reference text for the value check ${rule}`);
  }
  const { summary, why, anchor } = text;
  return ruleEntry({
    page: 'java-nitpicker',
    analyzers: JVM_ANALYZERS,
    builds: JVM_BUILDS,
    tool: 'pmd',
    rule,
    summary,
    why,
    allowed,
    exception: { key: 'exceptions', rule: `pmd/${rule}` },
    docs: [
      { label: 'Java preset guide', path: 'docs/java-preset.md', anchor },
      ...counterpartsOf(`pmd/${rule}`),
    ],
  });
}

export function valueCheckEntries(): RuleEntry[] {
  return VALUE_CHECKS.map(entryOf);
}
