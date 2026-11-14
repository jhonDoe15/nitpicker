import { RULES_TOOL } from '../tool.mjs';

const UPDATE_ADVICE = {
  django:
    'Update them in the database: `Order.objects.filter(...).update(status="expired")` (and `.delete()` for removal) changes every row in one statement without loading any.',
  sqlalchemy:
    'Update them in the database: `session.execute(update(Order).where(...).values(status="expired"))` (and `delete(Order).where(...)`) changes every row in one statement without loading any.',
};
const UPDATE_KEEP =
  ' Keep the loop for a model with hooks that a bulk statement skips: a `save()` override, `pre_save` or `post_save` receivers, `before_update` listeners, `auto_now` fields or a version column, which this rule leaves alone. An exception fits only when the rows must go through those hooks one at a time.';

const quoted = (fields) =>
  fields
    .split(',')
    .map((field) => `\`${field}\``)
    .join(', ');

export const ROW_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['in-memory-update'],
    describe: (subject) => {
      const [model, fields = ''] = subject.split('|');
      return `\`${model}\` rows are loaded only to set ${quoted(fields)} to the same value on each and save them back, which one update statement does without loading the rows`;
    },
    allowed: (subject) => {
      const [, , orm = 'django'] = subject.split('|');
      return `${UPDATE_ADVICE[orm] ?? UPDATE_ADVICE.django}${UPDATE_KEEP}`;
    },
  },
];
