import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { trackedFiles } from '../../tracked-files.mjs';
import { foreignKeyIndexFindings, migratesForeignKeys } from '../foreign-key-index.mjs';
import { yamlDocuments } from '../../../../core/tooling/yaml/yaml-documents.mjs';

const { createGitRepository } = useGitFixtures();

const ORDERS = [
  'CREATE TABLE customers (id bigserial PRIMARY KEY);',
  'CREATE TABLE orders (',
  '  id bigserial PRIMARY KEY,',
  '  customer_id bigint NOT NULL REFERENCES customers (id),',
  '  shop_id bigint NOT NULL REFERENCES shops (id)',
  ');',
  'CREATE INDEX orders_shop ON orders (shop_id);',
  '',
].join('\n');
const SQLC_V2 = [
  'version: "2"',
  'sql:',
  '  - engine: postgresql',
  '    schema: db/schema',
  '    queries: db/queries',
  '    gen:',
  '      go: { package: db, out: internal/db }',
  '',
].join('\n');

function project(files) {
  const { root } = createGitRepository(files);
  return { projectRoot: root, files: trackedFiles(root), parseYaml: yamlDocuments };
}

function reported(files) {
  return foreignKeyIndexFindings('repository-hygiene', project(files)).map(
    ({ path, location }) => `${path}:${String(location.line)}`,
  );
}

describe('foreign keys in sqlc schema files', () => {
  it('reports a key a schema folder declares without an index, with a schema hint', () => {
    const findings = foreignKeyIndexFindings(
      'repository-hygiene',
      project({ 'sqlc.yaml': SQLC_V2, 'db/schema/001_orders.sql': ORDERS }),
    );

    expect(findings.map(({ path, location }) => `${path}:${String(location.line)}`)).toEqual([
      'db/schema/001_orders.sql:4',
    ]);
    expect(findings[0].message).toMatch(
      /^db\/schema\/001_orders\.sql declares a foreign key on orders \(customer_id\) \(line 4\) and no schema file creates an index that starts with it\. Add `CREATE INDEX ON orders \(customer_id\)` to the schema\./u,
    );
  });

  it.each([
    [
      'a v1 package with a schema file next to the config',
      { 'backend/sqlc.json': '{"version":"1","packages":[{"schema":"schema.sql"}]}' },
      'backend/schema.sql',
    ],
    [
      'a glob and a list of schema paths',
      { 'sqlc.yml': 'version: "2"\nsql:\n  - engine: sqlite\n    schema: ["sql/*.sql"]\n' },
      'sql/tables.sql',
    ],
  ])('reads %s', (_, config, schemaFile) => {
    expect(reported({ ...config, [schemaFile]: ORDERS })).toEqual([`${schemaFile}:4`]);
  });

  it.each([
    ['a MySQL engine', SQLC_V2.replace('postgresql', 'mysql'), 'db/schema/001_orders.sql'],
    ['a down migration', SQLC_V2, 'db/schema/001_orders.down.sql'],
    ['a file outside the schema paths', SQLC_V2, 'db/queries/orders.sql'],
    ['an unreadable config', 'sql: [', 'db/schema/001_orders.sql'],
  ])('reports nothing for %s', (_, config, schemaFile) => {
    expect(reported({ 'sqlc.yaml': config, [schemaFile]: ORDERS })).toEqual([]);
  });

  it('checks a schema file that is also a migration once, and drops it for a MySQL engine', () => {
    const migration = 'db/migrations/000001_orders.up.sql';
    const config = SQLC_V2.replace('db/schema', 'db/migrations');

    expect(reported({ 'sqlc.yaml': config, [migration]: ORDERS })).toEqual([`${migration}:4`]);
    expect(
      reported({ 'sqlc.yaml': config.replace('postgresql', 'mysql'), [migration]: ORDERS }),
    ).toEqual([]);
  });

  it('counts keys in sqlc schema files as declared by the schema, which keeps model rules quiet', () => {
    const { projectRoot, files, parseYaml } = project({
      'sqlc.yaml': SQLC_V2,
      'db/schema/001_orders.sql': ORDERS,
    });

    expect(migratesForeignKeys(projectRoot, files, parseYaml)).toBe(true);
  });
});
