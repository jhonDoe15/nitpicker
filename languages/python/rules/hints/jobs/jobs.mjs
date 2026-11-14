import { RULES_TOOL } from '../tool.mjs';
import { parseEffect } from '../effects/subject.mjs';

function describe(subject) {
  const { path, fields } = parseEffect(subject);
  const [call = '<call>', job = 'job'] = fields;
  return `\`${path[0]}\` is a ${job} whose loop calls \`${call}\` for each item with no \`try\` around the work of one item: the first item that raises stops every item after it until the next run, and an item that keeps failing blocks the rest for good`;
}

export const JOB_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['job-item-failure-stops-run'],
    describe,
    allowed:
      'Wrap the work for one item in `try`/`except` that records the failure and goes on, enqueue one task per item (`task.delay(item)`) so the queue isolates them, or collect the results and report the failures after the loop. A job that must fail the whole run on purpose belongs in an exception with that reason.',
  },
];
