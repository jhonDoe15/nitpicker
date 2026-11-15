import { describe, expect, it } from 'vitest';
import { useGitFixtures, writeFiles } from '../../../fix/test-support/git-fixtures.mts';
import { withoutGatedForeignKeys } from '../../typed/go-report-readers.mts';

const { temporaryRoot } = useGitFixtures();
const MODEL_FILE = 'models/pet.go';
const KEY = { tool: 'go-rules', rule: 'unindexed-foreign-key', file: MODEL_FILE, line: 6 };
const OTHER = { tool: 'go-rules', rule: 'io-in-loop', file: MODEL_FILE, line: 9 };
const MODEL = 'package models\n\ntype Pet struct {\n\tgorm.Model\n\tUserID uint\n}\n';
const POSTGRES_MODULE = 'module shop\n\nrequire gorm.io/driver/postgres v1.6.0\n';
const MYSQL_MODULE = 'module shop\n\nrequire gorm.io/driver/mysql v1.6.0\n';
const MIGRATION = 'CREATE TABLE pets (id serial PRIMARY KEY, user_id int REFERENCES users (id));\n';
const GORM_OFF =
  'package main\n\nvar config = gorm.Config{DisableForeignKeyConstraintWhenMigrating: true}\n';
const GORM_ASSIGNED =
  'package main\n\nfunc setup() { config.DisableForeignKeyConstraintWhenMigrating = true }\n';
const COMMENTED = 'package main\n\n// migrate.WithForeignKeys(false) would drop the keys\n';
const ENT_OFF =
  'package main\n\nfunc run() { client.Schema.Create(ctx, migrate.WithForeignKeys(false)) }\n';

function project(files: Readonly<Record<string, string>>) {
  const root = temporaryRoot('go-keys-');
  writeFiles(root, { [MODEL_FILE]: MODEL, ...files });
  return root;
}

function kept(files: Readonly<Record<string, string>>) {
  return withoutGatedForeignKeys(project(files), [KEY, OTHER]).map(({ rule }) => rule);
}

describe('withoutGatedForeignKeys', () => {
  it.each([
    ['PostgreSQL module', { 'go.mod': POSTGRES_MODULE }],
    ['unknown database', { 'go.mod': 'module shop\n' }],
    ['GORM switch in a test file', { 'go.mod': POSTGRES_MODULE, 'main_test.go': GORM_OFF }],
    ['switch in testdata', { 'go.mod': POSTGRES_MODULE, 'testdata/main.go': GORM_OFF }],
    ['switch in a comment', { 'go.mod': POSTGRES_MODULE, 'main.go': COMMENTED }],
  ])('keeps the finding with a %s', (_, files) => {
    expect(kept(files)).toEqual(['unindexed-foreign-key', 'io-in-loop']);
  });

  it.each([
    ['a MySQL module', { 'go.mod': MYSQL_MODULE }],
    ['migrations that declare the keys', { 'migrations/0001_init.up.sql': MIGRATION }],
    ['GORM foreign keys turned off', { 'main.go': GORM_OFF }],
    ['GORM foreign keys turned off by assignment', { 'db/open.go': GORM_ASSIGNED }],
    ['ent foreign keys turned off', { 'cmd/migrate/main.go': ENT_OFF }],
  ])('drops only the foreign-key finding with %s', (_, files) => {
    expect(kept(files)).toEqual(['io-in-loop']);
  });

  it('leaves the findings as they are when none is a foreign key', () => {
    const root = project({});
    expect(withoutGatedForeignKeys(root, [OTHER])).toEqual([OTHER]);
  });
});
