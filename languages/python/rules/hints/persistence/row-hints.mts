import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const DJANGO = 'django';
const MODEL = '<model>';

const UPDATE_ADVICE: Readonly<Record<string, string>> = {
  django:
    'Update them in the database: `Order.objects.filter(...).update(status="expired")` (and `.delete()` for removal) changes every row in one statement without loading any.',
  sqlalchemy:
    'Update them in the database: `session.execute(update(Order).where(...).values(status="expired"))` (and `delete(Order).where(...)`) changes every row in one statement without loading any.',
};
const UPDATE_KEEP =
  ' Keep the loop for a model with hooks that a bulk statement skips: a `save()` override, `pre_save` or `post_save` receivers, `before_update` listeners, `auto_now` fields or a version column, which this rule leaves alone. An exception fits only when the rows must go through those hooks one at a time.';

function entry(
  table: Readonly<Record<string, string>>,
  key: string | undefined,
  fallback: string,
): string {
  return (key === undefined ? undefined : table[key]) ?? table[fallback] ?? '';
}

function quoted(fields: string): string {
  return fields
    .split(',')
    .map((field) => `\`${field}\``)
    .join(', ');
}

export const ROW_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['in-memory-update'],
    describe: (subject) => {
      const [model = MODEL, fields = ''] = subject.split('|');
      return `\`${model}\` rows are loaded only to set ${quoted(fields)} to the same value on each and save them back, which one update statement does without loading the rows`;
    },
    allowed: (subject = '') => {
      const [, , orm = DJANGO] = subject.split('|');
      return `${entry(UPDATE_ADVICE, orm, DJANGO)}${UPDATE_KEEP}`;
    },
  },
];

const COLUMN_ADVICE: Readonly<Record<string, string>> = {
  django:
    'Ask for the column: `User.objects.filter(...).values_list("email", flat=True)` (or `.only("email")` when the model is needed).',
  sqlalchemy:
    'Select the column: `session.scalars(select(User.email).where(...))` instead of loading the whole `User`.',
};
const EXISTENCE_ADVICE: Readonly<Record<string, string>> = {
  django:
    'Ask the database: `Model.objects.filter(...).exists()` stops at the first row and loads none. An exception fits only when the loaded row is needed for more than the test.',
  sqlalchemy:
    'Ask the database: `session.scalar(select(exists().where(...)))` (or `session.query(exists().where(...)).scalar()`) stops at the first row and loads none. An exception fits only when the loaded row is needed for more than the test.',
};
const EXISTENCE_WORK: Readonly<Record<string, string>> = {
  count: 'counted only to test for none',
  first: 'loaded only to test whether one exists',
};
const SMALL_TABLE =
  ' An exception fits only for a small fixed lookup table that is meant to be loaded whole.';

export const NARROW_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['row-for-one-column'],
    describe: (subject) => {
      const [model = MODEL, field = '<column>'] = subject.split('|');
      return `\`${model}\` rows are loaded whole only to read \`${field}\` from each, when the query can return just that column`;
    },
    allowed: (subject = '') =>
      `${entry(COLUMN_ADVICE, subject.split('|')[2], DJANGO)}${SMALL_TABLE}`,
  },
  {
    tool: RULES_TOOL,
    rules: ['row-for-existence'],
    describe: (subject) => {
      const [model = MODEL, shape] = subject.split('|');
      return `\`${model}\` rows are ${entry(EXISTENCE_WORK, shape, 'first')}, when an existence query answers it`;
    },
    allowed: (subject = '') => entry(EXISTENCE_ADVICE, subject.split('|')[2], DJANGO),
  },
];
