import { ruleEntry } from '../../typed/entry-views.mts';
import type { RuleEntry } from '../../typed/entry-views.mts';
import { JVM_ANALYZERS, JVM_BUILDS } from '../../catalog-rules.mts';
import {
  COMMENTED_OUT_CODE_MESSAGE,
  COMMENTED_OUT_CODE_RULE,
  TASK_MARKER_RULE,
} from '../../../adapters/comments/comment-findings.mts';
import {
  PLACEHOLDER_MESSAGE,
  PLACEHOLDER_RULE,
} from '../../../adapters/comments/placeholders/placeholder-code.mts';
import { TASK_MARKER_MESSAGE } from '../../../adapters/comments/task-markers.mts';

const JVM = { page: 'java-nitpicker', analyzers: JVM_ANALYZERS, builds: JVM_BUILDS };

export function commentEntries(): RuleEntry[] {
  return [
    {
      rule: TASK_MARKER_RULE,
      summary:
        'A `TODO`, `FIXME`, `XXX`, `HACK` or `STOPSHIP` comment in a Java source with no issue reference.',
      why: 'A task marker without an issue is never picked up, so it stays in the code for good.',
      allowed: TASK_MARKER_MESSAGE,
    },
    {
      rule: COMMENTED_OUT_CODE_RULE,
      summary: 'A comment in a Java source whose lines read as Java statements or declarations.',
      why: 'Commented-out code goes stale and hides what is live; version control keeps the old version.',
      allowed: COMMENTED_OUT_CODE_MESSAGE,
    },
    {
      rule: PLACEHOLDER_RULE,
      summary:
        'In main sources: a comment that calls the code a stand-in for the real work ("in a real application ...", "simulate the API call", "placeholder implementation", "replace with the real ...", "mock data for now"), on or right above a statement that is one by its shape: a `return` of a literal or an empty collection that is not the first statement of an `if`, loop or other block, a bare `Thread.sleep`, an assignment whose value is one plain name, or a method body that holds only the comment.',
      why: 'The stand-in compiles and a demo works, so it reaches production: a fixed delay instead of a request, a constant instead of a query, an amount that is never converted.',
      allowed: PLACEHOLDER_MESSAGE,
    },
  ].map(({ rule, ...entry }) =>
    ruleEntry({
      ...JVM,
      tool: 'pmd',
      rule,
      ...entry,
      exception: { key: 'exceptions', rule: `pmd/${rule}` },
    }),
  );
}
