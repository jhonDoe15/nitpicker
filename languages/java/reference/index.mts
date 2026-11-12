import { catalogRuleEntries } from './catalog-rules.mts';
import { errorProneEntries } from './errorprone-rules.mts';
import { guardRuleEntries } from './guards/guard-rules.mts';
import { detektEntries } from './kotlin/detekt-rules.mts';
import { kotlinNitpickerEntries } from './kotlin/source-rules.mts';
import { jvmNitpickerEntries } from './nitpicker-rules.mts';
import { kotlinReviewEntries, leftOutPmdRules, ownPmdEntry, ownPmdRules } from './pmd-rules.mts';

/** The entries of every rule the Java and Kotlin presets can report. */
export function jvmRuleEntries() {
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
    ...guardRuleEntries(),
    ...detektEntries(),
    ...kotlinNitpickerEntries(),
  ];
}
