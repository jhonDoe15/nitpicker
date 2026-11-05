import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mjs';
import { trackedFiles } from '../tracked-files.mjs';
import { hardcodedNameFindings } from './hardcoded-names.mjs';

const { createGitRepository } = useGitFixtures();

function check(files) {
  const { root } = createGitRepository(files);
  return hardcodedNameFindings('repository-hygiene', {
    projectRoot: root,
    files: trackedFiles(root),
  });
}

const summary = (findings) =>
  findings.map(({ path, identity, location }) => [path, identity.split('|').at(-1), location.line]);

const FLYWAY = 'src/main/resources/db/migration';

describe('hardcoded names in migrations', () => {
  it('reports the public schema once per file, with the count and the first line', () => {
    const findings = check({
      [`${FLYWAY}/V2__users.sql`]: [
        'create table users (id int);',
        'alter table "public"."orders" add column user_id int;',
        'create index on public.orders (user_id);',
        '',
      ].join('\n'),
    });

    expect(findings).toEqual([
      {
        tool: 'repository-hygiene',
        rule: 'migration-hardcoded-name',
        path: `${FLYWAY}/V2__users.sql`,
        identity: `migration-hardcoded-name|${FLYWAY}/V2__users.sql|public-schema`,
        message:
          `${FLYWAY}/V2__users.sql qualifies 2 names with the \`public\` schema (first on line 2: ` +
          '`alter table "public"."orders" add column user_id int;`). An install that keeps its tables in ' +
          'another schema (search_path set to it) misses them. Leave the schema out and let search_path resolve ' +
          'the name. If this is intended, add ' +
          `{"rule":"migration-hardcoded-name","paths":["${FLYWAY}/**"],"reason":"..."} to "exceptions" ` +
          'in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 2 },
      },
    ]);
  });

  it('reads every migration layout, Liquibase changelogs included', () => {
    const findings = check({
      'src/schema/migrations/1752000000000-Users.ts':
        'await sql`ALTER DATABASE immich SET search_path TO public`.execute(db);\n',
      'migrations/20240101000000_owner.js':
        "exports.up = (knex) => knex.raw('ALTER TABLE t OWNER TO app_admin');\n",
      'src/main/resources/db/changelog/001-users.xml':
        '<sql>create view v as select * from public.users</sql>\n',
      'alembic/versions/a1_init.py':
        'revision = "a1"\ndown_revision = None\nop.execute("select public.f()")\n',
      'shop/orders/migrations/0002_note.py':
        'class Migration:\n    sql = "ALTER DATABASE shop OWNER TO shop"\n',
      'prisma/migrations/20240101000000_init/migration.sql':
        'ALTER TABLE "public"."User" ADD x int;\n',
    });

    expect(summary(findings)).toEqual([
      ['alembic/versions/a1_init.py', 'public-schema', 3],
      ['migrations/20240101000000_owner.js', 'owner-name', 1],
      ['prisma/migrations/20240101000000_init/migration.sql', 'public-schema', 1],
      ['shop/orders/migrations/0002_note.py', 'database-name', 2],
      ['shop/orders/migrations/0002_note.py', 'owner-name', 2],
      ['src/main/resources/db/changelog/001-users.xml', 'public-schema', 1],
      ['src/schema/migrations/1752000000000-Users.ts', 'database-name', 1],
    ]);
  });

  it('allows the current database, the current role, unqualified names and code outside migrations', () => {
    const findings = check({
      [`${FLYWAY}/V3__settings.sql`]: [
        "DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET timezone TO ''UTC''', current_database()); END $$;",
        'ALTER DATABASE CHARACTER SET utf8mb4;',
        'ALTER TABLE orders OWNER TO CURRENT_USER;',
        'ALTER TABLE orders OWNER TO "session_user";',
        'create table republic.users (id int);',
        'grant usage on schema public to app;',
        '',
      ].join('\n'),
      'src/main/java/app/Users.java': 'class Users { String q = "select * from public.users"; }\n',
      'src/db/queries.sql': 'select * from public.users;\n',
      'src/migrations/1752000000000-Users.test.ts': "const sql = 'select * from public.users';\n",
    });

    expect(findings).toEqual([]);
  });

  it('skips comments, and reads quoted and backticked names', () => {
    const findings = check({
      [`${FLYWAY}/V4__notes.sql`]: [
        '-- moved from public.orders',
        '/* public.items and',
        '   OWNER TO admin */',
        'ALTER DATABASE `shop-db` CHARACTER SET utf8mb4;',
        'ALTER TABLE orders OWNER TO "app-admin";',
        'ALTER DATABASE UPGRADE DATA DIRECTORY NAME;',
        '',
      ].join('\n'),
      'migrations/20240101000000_note.ts':
        "// public.orders\nexport const up = () => 'select 1';\n",
      'alembic/versions/b2_note.py': '# public.orders\nrevision = "b2"\n',
    });

    expect(summary(findings)).toEqual([
      [`${FLYWAY}/V4__notes.sql`, 'database-name', 4],
      [`${FLYWAY}/V4__notes.sql`, 'owner-name', 5],
    ]);
    expect(findings.map(({ message }) => message.split(' (line')[0])).toEqual([
      `${FLYWAY}/V4__notes.sql names the database \`shop-db\` in ALTER DATABASE`,
      `${FLYWAY}/V4__notes.sql hands ownership to the role \`app-admin\``,
    ]);
  });

  it('only reads files directly in a migrations folder', () => {
    expect(
      check({
        'src/migrations/helpers/sql.ts': "export const q = 'select * from public.users';\n",
        'src/migrate/runner.ts': "export const q = 'select * from public.users';\n",
      }).map(({ path }) => path),
    ).toEqual(['src/migrate/runner.ts']);
  });

  it('leaves the schema and owners in pg_dump and the schema in Atlas output', () => {
    const findings = check({
      'db/migrations/20240101000000_baseline.sql':
        '-- Dumped from database version 16.2\nCREATE TABLE public.users (id int);\nALTER TABLE public.users OWNER TO postgres;\n',
      'atlas/migrations/atlas.sum': 'h1:abc\n',
      'atlas/migrations/20240101000000_init.sql': 'CREATE TABLE "public"."users" (id int);\n',
    });

    expect(findings).toEqual([]);
  });

  it('leaves the public schema in drizzle-kit output, but not other names', () => {
    const findings = check({
      'drizzle/meta/_journal.json': '{"entries":[]}\n',
      'drizzle/0001_users.sql':
        'ALTER TABLE "posts" ADD CONSTRAINT "fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");\n' +
        'ALTER TABLE "posts" OWNER TO admin;\n',
    });

    expect(summary(findings)).toEqual([['drizzle/0001_users.sql', 'owner-name', 2]]);
  });
});
