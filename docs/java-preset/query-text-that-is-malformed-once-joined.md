# Query text that is malformed once joined

SQL (and Lua script) text built from literal parts is checked once the parts are joined. A malformed result is an
enforceable `pmd/MalformedQueryText` finding (`languages/java/adapters/review-rules/query-text/`), in the Java and
Kotlin presets alike; the text rules live in `shared/rules/query-text/`. The statement fails only on the path
that uses the fragment, which is often an optional filter that tests never take. Merged fixes in open-source
projects (a configuration server, a distributed transaction manager, a Redis client, a vector store) added the
missing placeholder, value or space.

- **Reported:** a chain of string literals joined with `+` (or a single literal) that starts with a query keyword
  (`SELECT`, `INSERT INTO`, `UPDATE ... SET`, `DELETE FROM`, `MERGE INTO`, `WITH ... AS`) or with a fragment
  (`AND`, `OR`, `WHERE`, `ORDER BY`, `GROUP BY`, `JOIN`...), when
  - a comparison operator, `LIKE`, `IN` or `BETWEEN` ends the text with no operand: the chain is passed to
    `query`, `update`, `execute`, `prepareStatement`, `createNativeQuery` or `String.format`, or is assigned (`x = `,
    `x +=`) and the next statement does not use `x` (`where += " AND group_id LIKE ";`);
  - an operator is followed by `AND`, `OR`, `ORDER`, `GROUP`, `LIMIT`, `HAVING` or `UNION` (`a = AND b = ?`);
  - an `INSERT INTO t (c1, ..., cn) VALUES (v1, ..., vm)` has `n != m` and both lists are literal (a value that is
    interpolated or a column list from a constant is not counted);
  - two literal parts join into a run-together word where one side is a query or Lua keyword (`"... FROM t" + "WHERE"`,
    `"... then" + "redis.call(...)"`).
- **Allowed forms, not reported:** a bind placeholder or value after every operator (`LIKE ?`, `= " + id`), a space
  at the start of every appended fragment, a fragment that the next statement continues (`where += "?"`, or any use
  of the variable), text that does not read like SQL (`"Select a value ="`), and `StringBuilder.append` chains.
- **Not covered:** builders, text assembled in loops, predicates joined without `AND`, `IN (?)` bound to a joined
  string, dialect-specific syntax, and column lists that come from constants.

The message shows the joined text around the slip and ends with the exception sentence for
`{ "rule": "pmd/MalformedQueryText", "paths": ["<file>"], "reason": "..." }`. Tests:
`adapters/review-rules/query-text/query-text.test.mts` and `shared/rules/query-text/query-text.test.mts`. The
TypeScript and JavaScript counterpart is `nitpicker/no-malformed-query-text`.
