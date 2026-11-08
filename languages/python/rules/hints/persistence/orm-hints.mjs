import { RULES_TOOL } from '../tool.mjs';

const QUERY_WORK = {
  count: 'counted or tested for none',
  filter: 'filtered',
  sort: 'sorted',
  aggregate: 'aggregated',
};

export const PERSISTENCE_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['eager-relationship'],
    describe: (subject) => `\`${subject}\` loads its related rows on every query of the model`,
    allowed:
      'Leave `lazy` at its default (or set `lazy="raise"`) and load the relation on the queries that need it: `select(Order).options(selectinload(Order.lines))`. An exception fits only for a small lookup relation that every read of the model needs.',
  },
  {
    tool: RULES_TOOL,
    rules: ['many-to-many-cascade-delete'],
    describe: (subject) =>
      `The many-to-many relationship \`${subject}\` deletes related rows that other owners still share`,
    allowed:
      'Cascade only `"save-update, merge"` on a `secondary=` (or `link_model=`) relationship; deleting the owner already deletes its rows in the association table.',
  },
  {
    tool: RULES_TOOL,
    rules: ['multiple-collection-joins'],
    describe: (subject) => {
      const [first, second] = subject.split(' ');
      return `\`${first}\` and \`${second}\` are both collections joined into one query, so it returns every row of the first once for each row of the second`;
    },
    allowed:
      'Load the collections with `selectinload`, one query each: `select(Order).options(selectinload(Order.lines), selectinload(Order.payments))`; one `joinedload` of a collection next to to-one relations stays one row per child. An exception fits only when both collections are known to stay small.',
  },
  {
    tool: RULES_TOOL,
    rules: ['in-memory-query'],
    describe: (subject) => {
      const [model, shape] = subject.split(' ');
      const work = QUERY_WORK[shape] ?? 'counted, filtered, sorted or aggregated';
      return `\`${model}\` rows are ${work} in Python after a query loaded them all, when the database could do it`;
    },
    allowed:
      'Ask the database: `.count()` or `.exists()` instead of `len()` or a truth test; `.filter()`/`.exclude()` (Django) or `.where()` (SQLAlchemy) instead of a comprehension, `filter()` or `next()`, and `.filter(...).exists()` instead of `any()` or `all()`; `.order_by()` instead of `sorted()`, `.sort()` or `max(key=)`; `.aggregate()`/`.annotate()` (Django) or `func.sum`/`func.count` with `group_by` (SQLAlchemy) instead of `sum()`, `max()`, `min()` or `Counter`. An exception fits only for a small fixed lookup table that is meant to be loaded whole.',
  },
];
