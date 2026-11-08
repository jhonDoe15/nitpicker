import { RULES_TOOL } from '../tool.mjs';

export const ORM_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['orm-schema-sync'],
    describe: (subject) =>
      `\`${subject}\` lets the ORM create, alter or drop tables when the application runs, so a deploy can drop columns and their data and the schema drifts from the migrations`,
    allowed:
      'Change the schema with migrations instead: Alembic (`alembic upgrade head` in the deploy step), Django migrations, or Aerich for Tortoise; create tables in test fixtures, not in the application. An environment check around the call (`if settings.DEBUG:`) still changes the schema in every other environment. A local script outside the application, such as a seed, takes an exception.',
  },
  {
    tool: RULES_TOOL,
    rules: ['orm-query-logging'],
    describe: (subject) =>
      `\`${subject}\` logs every SQL query: the logs fill with personal data and bound values, and every query pays for the log line`,
    allowed:
      'Leave `echo` and the query loggers off and log slow queries instead: time queries with SQLAlchemy `before_cursor_execute`/`after_cursor_execute` events and log only the slow ones, or use the database\'s own slow-query log (`log_min_duration_statement` in PostgreSQL). A value switched on by an environment check (`echo=os.environ.get("ENV") != "production"`) still logs in every other environment. A local debugging script takes an exception.',
  },
];
