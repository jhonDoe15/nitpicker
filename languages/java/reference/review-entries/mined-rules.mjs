import { ruleEntry } from '../../../../shared/reference/entry.mjs';
import { counterpartsOf } from '../../../../shared/reference/counterparts.mjs';
import { JVM_ANALYZERS, JVM_BUILDS } from '../catalog-rules.mjs';
import {
  AFFIX_BOUNDARY_ALLOWED,
  AFFIX_BOUNDARY_EXCEPTION_RULE,
  AFFIX_BOUNDARY_RULE,
} from '../../adapters/review-rules/affix-boundaries/affix-boundaries.mjs';
import {
  AFFIX_REPLACE_ALLOWED,
  AFFIX_REPLACE_EXCEPTION_RULE,
  AFFIX_REPLACE_RULE,
} from '../../adapters/review-rules/affix-replace/affix-replace.mjs';

const READ_FOR_IT = 'Nitpicker reads the sources of every module for it and prints it as a PMD rule.';

const ENTRIES = [
  {
    rule: AFFIX_BOUNDARY_RULE,
    exception: AFFIX_BOUNDARY_EXCEPTION_RULE,
    anchor: 'paths-and-hosts-matched-by-text',
    allowed: AFFIX_BOUNDARY_ALLOWED,
    summary:
      'A `String` `startsWith` or `endsWith` on a path, route, ' +
      'package or host whose argument has no separator boundary: ' +
      '`path.startsWith(base)`, `host.endsWith(domain)`, ' +
      '`uri.startsWith("http://localhost")`.',
    why:
      `A text prefix also accepts a sibling that only shares the ` +
      `text (\`/foo\` matches \`/foobar\`, \`example.com\` matches ` +
      `\`evilexample.com\`), which leaks files, routes and cookies, ` +
      `or lets a redirect through. ${READ_FOR_IT}`,
  },
  {
    rule: AFFIX_REPLACE_RULE,
    exception: AFFIX_REPLACE_EXCEPTION_RULE,
    anchor: 'suffixes-and-prefixes-removed-by-replace',
    allowed: AFFIX_REPLACE_ALLOWED,
    summary:
      'A `String` `replace(".git", "")`, or `replace(suffix, "")`, ' +
      '`replace(root, "")` with a suffix, prefix or directory name, ' +
      'used to remove a suffix or prefix.',
    why:
      `\`replace\` removes every occurrence anywhere in the text, so ` +
      `\`blog.git.io\` loses its \`.git\` and a path that contains ` +
      `the directory twice is rewritten in the wrong place. ` +
      `${READ_FOR_IT}`,
  },
];

export function minedEntries() {
  return ENTRIES.map(({ rule, exception, anchor, ...fields }) =>
    ruleEntry({
      page: 'java-nitpicker',
      analyzers: JVM_ANALYZERS,
      builds: JVM_BUILDS,
      tool: 'pmd',
      rule,
      ...fields,
      exception: { key: 'exceptions', rule: exception },
      docs: [
        { label: 'Java preset guide', path: 'docs/java-preset.md', anchor },
        ...counterpartsOf(exception),
      ],
    }),
  );
}
