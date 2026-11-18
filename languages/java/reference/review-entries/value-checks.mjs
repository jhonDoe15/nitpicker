import { ruleEntry } from '../../../../shared/reference/entry.mjs';
import { counterpartsOf } from '../../../../shared/reference/counterparts.mjs';
import { JVM_ANALYZERS, JVM_BUILDS } from '../catalog-rules.mjs';
import { VALUE_CHECKS } from '../../adapters/review-rules/value-checks/value-checks.mjs';
import { VALUE_CHECK_TEXTS } from './value-check-texts.mjs';

function entryOf({ rule, allowed }) {
  const { summary, why, anchor } = VALUE_CHECK_TEXTS[rule];
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

export function valueCheckEntries() {
  return VALUE_CHECKS.map(entryOf);
}
