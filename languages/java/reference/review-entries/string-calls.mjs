import { ruleEntry } from '../../../../shared/reference/entry.mjs';
import { counterpartsOf } from '../../../../shared/reference/counterparts.mjs';
import { JVM_ANALYZERS, JVM_BUILDS } from '../catalog-rules.mjs';
import {
  EXPANDING_REPLACEMENT_ALLOWED,
  EXPANDING_REPLACEMENT_RULE,
  PATTERN_TRANSLATION_ALLOWED,
  UNESCAPED_HTML_ALLOWED,
  UNESCAPED_HTML_RULE,
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
    entry({
      rule: EXPANDING_REPLACEMENT_RULE,
      summary:
        'A `replaceAll` or `replaceFirst` with two arguments, a matcher `replaceAll(repl)`, or a Kotlin `Regex` `replace(text, repl)` whose replacement is not a literal, a constant, a lambda or `Matcher.quoteReplacement`/`Regex.escapeReplacement`.',
      why: 'The replacement is read as a template: `$1`, `${name}` and a backslash in a namespace, a tenant id or a table name are expanded or throw `IllegalArgumentException` instead of being inserted. Nitpicker reads the sources of every module for it and prints it as a PMD rule.',
      allowed: EXPANDING_REPLACEMENT_ALLOWED,
      anchor: 'replacement-strings-that-expand',
    }),
    entry({
      rule: UNESCAPED_HTML_RULE,
      summary:
        'A string literal holding an HTML tag that is concatenated, templated (`${value}` in Kotlin) or formatted (`%s`) with a value that is not a literal, a number or the result of an escape call.',
      why: 'A `<`, `&` or quote in a name, a title or a message breaks the markup or injects a tag into a page, an email or a rendered report. Nitpicker reads the sources of every module for it and prints it as a PMD rule.',
      allowed: UNESCAPED_HTML_ALLOWED,
      anchor: 'html-built-from-unescaped-values',
    }),
  ];
}
