import { catalogRuleEntries } from './catalog-rules.mts';
import { effectsEntries } from './effects/effects-rules.mts';
import { errorProneEntries } from './errorprone-rules.mts';
import { guardRuleEntries } from './guards/guard-rules.mts';
import { detektEntries } from './kotlin/detekt-rules.mts';
import { kotlinNitpickerEntries } from './kotlin/source-rules.mts';
import { jvmNitpickerEntries } from './nitpicker-rules.mts';
import type { RuleEntry } from './typed/entry-views.mts';
import { kotlinReviewEntries, leftOutPmdRules, ownPmdEntry, ownPmdRules } from './pmd-rules.mts';

export function jvmRuleEntries(): RuleEntry[] {
  const own = ownPmdRules();
  const notCatalogued = new Set([...leftOutPmdRules(), ...own.map(({ rule }) => rule)]);
  const javaEntries = [
    ...catalogRuleEntries({ skippedPmd: notCatalogued }),
    ...own.map(ownPmdEntry),
  ];
  return [
    ...javaEntries,
    ...kotlinReviewEntries(new Set(javaEntries.map(({ id }) => id))),
    ...errorProneEntries(),
    ...jvmNitpickerEntries(),
    ...effectsEntries(),
    ...guardRuleEntries(),
    ...detektEntries(),
    ...kotlinNitpickerEntries(),
  ];
}
