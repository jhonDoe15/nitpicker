import { ruleEntry } from '../../../../shared/reference/entry.mjs';
import { counterpartsOf } from '../../../../shared/reference/counterparts.mjs';
import { JVM_ANALYZERS, JVM_BUILDS } from '../catalog-rules.mjs';
import {
  PATTERN_TRANSLATION_ALLOWED,
  PATTERN_TRANSLATION_RULE,
} from '../../adapters/review-rules/string-calls/string-calls.mjs';

const BASE = {
  page: 'java-nitpicker',
  analyzers: JVM_ANALYZERS,
  builds: JVM_BUILDS,
  tool: 'pmd',
};

function entry({ rule, summary, why, allowed, anchor }) {
  return ruleEntry({
    ...BASE,
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

export function stringCallEntries() {
  return [
    entry({
      rule: PATTERN_TRANSLATION_RULE,
      summary:
        'A chain of two or more `replace`, `replaceAll` or `replaceFirst` calls on one value whose replacements are regex tokens (`.*`, `[^/]*`, `.`) that reaches `Pattern.compile`, `Regex` or `toRegex`, or are `LIKE` tokens (`%` and `_`), with no `Pattern.quote`, `Regex.escape` or escaping replace first.',
      why: 'A configured glob or pattern with a `.`, `$`, `+` or `%` in it then means something else in the target language: an allow-list widens, a table name breaks the regex, a `%` becomes a wildcard. Nitpicker reads the sources of every module for it and prints it as a PMD rule.',
      allowed: PATTERN_TRANSLATION_ALLOWED,
      anchor: 'patterns-translated-without-escaping',
    }),
  ];
}
