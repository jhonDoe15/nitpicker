import { catalogRuleEntries } from './catalog-rules.mjs';
import { errorProneEntries } from './errorprone-rules.mjs';
import { detektEntries } from './kotlin/detekt-rules.mjs';
import { kotlinNitpickerEntries } from './kotlin/source-rules.mjs';
import { jvmNitpickerEntries } from './nitpicker-rules.mjs';
import { kotlinReviewEntries, leftOutPmdRules, ownPmdEntry, ownPmdRules } from './pmd-rules.mjs';

/** The entries of every rule the Java and Kotlin presets can report. */
export function jvmRuleEntries() {
  const leftOut = new Set(leftOutPmdRules());
  const javaEntries = [
    ...catalogRuleEntries().filter(({ tool, rule }) => tool !== 'pmd' || !leftOut.has(rule)),
    ...ownPmdRules().map(ownPmdEntry),
  ];
  return [
    ...javaEntries,
    ...kotlinReviewEntries(new Set(javaEntries.map(({ id }) => id))),
    ...errorProneEntries(),
    ...jvmNitpickerEntries(),
    ...detektEntries(),
    ...kotlinNitpickerEntries(),
  ];
}
