import type { RuleEntry } from '../typed/entry-views.mts';
import { pmdGuideEntry } from '../catalog-rules.mts';
import { VALUE_CHECKS } from '../../adapters/review-rules/value-checks/value-checks.mts';
import { VALUE_CHECK_TEXTS } from './value-check-texts.mts';

function entryOf({ rule, allowed }: { rule: string; allowed: string }): RuleEntry {
  const text = VALUE_CHECK_TEXTS[rule];
  if (text === undefined) {
    throw new Error(`No reference text for the value check ${rule}`);
  }
  const { summary, why, anchor } = text;
  return pmdGuideEntry({ rule, summary, why, allowed, anchor });
}

export function valueCheckEntries(): RuleEntry[] {
  return VALUE_CHECKS.map(entryOf);
}
