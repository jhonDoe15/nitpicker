import { RULES_TOOL } from '../tool.mjs';

export const QUERY_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['unordered-query'],
    describe: (subject) =>
      `\`${subject}\` takes a page of rows (\`limit\`, \`offset\`, a queryset slice, SQL \`LIMIT\`, \`OFFSET\` or \`FETCH\`) or builds an \`array_agg\`/\`json_agg\` list with no ORDER BY, so which rows come back, and in which order, is up to the database and can change between runs`,
    allowed:
      'Order on a unique key, or add a tie-breaker after a non-unique key: `select(User).order_by(User.created.desc(), User.id).limit(20)`, `Order.objects.order_by("-created", "id")[:20]` (or `ordering` in the model\'s `Meta`), `order by created desc, id` in SQL text, `func.array_agg(aggregate_order_by(t.c.name, t.c.name))` or `ArrayAgg("name", order_by="name")`. `limit(1)` is fine when the query selects only a constant or a count. An exception fits only a query whose rows come back in one order anyway, or a nested list that is a set whose callers never depend on its order.',
  },
  {
    tool: RULES_TOOL,
    rules: ['unbounded-query-array'],
    describe: (subject) =>
      `\`${subject}\` is expanded into the statement with one bound parameter per element (an \`in_\` list, or every column of every row of \`insert().values(rows)\`): an empty insert fails, a long list makes a slow statement, and PostgreSQL takes at most 65,535 bound parameters with a driver that binds on the server (asyncpg, psycopg 3)`,
    allowed:
      'Return early when it is empty and split it into chunks (`for part in itertools.batched(ids, 1000):`), or send the whole list as one array parameter (`User.id == any_(bindparam("ids", ids, type_=ARRAY(Integer)))`); for rows, `session.execute(insert(User), rows)` lets SQLAlchemy batch them. An exception fits only a list that its callers bound, such as a request field with a maximum length.',
  },
];
