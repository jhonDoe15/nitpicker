import { exceptionEntryText, exceptionSentence } from '../../messages/exception-sentence.mts';
import { HYGIENE_RULE_IDS } from '../../project-rules/hygiene-rules.mts';
import { graphCandidate, isMigrationFile } from '../migrations/migration-files.mts';
import { lineAt } from '../../conventions/lines.mts';
import { readSource } from '../migrations/revision-graph.mts';
import { databaseKinds } from './database-kind.mts';
import { isMysqlDialect, leadsWith, migrationSchema } from './migration-schema.mts';
import { unindexedPrismaRelations } from './prisma-schema.mts';
import { sqlcSchemaFiles } from './sources/sqlc-schemas.mts';
import type { FindingDraft, ParseYaml, RepositoryContext } from '../check-types.mts';
import type { Finding } from '../../values/findings.mts';
import type {
  ForeignKeyFact,
  IndexFact,
  MigrationSchema,
  NamedForeignKey,
  PrismaRelation,
  SchemaEntry,
} from './schema-types.mts';

type SchemaContext = Pick<RepositoryContext, 'projectRoot' | 'files' | 'parseYaml'>;

const RULE = HYGIENE_RULE_IDS.foreignKeyIndex;
const MYSQL = 'mysql';
const DOWN_FILE = /(?:^|[/._-])down\.sql$/iu;
const CHANGELOG_FILE = /\.(?:xml|ya?ml|json)$/iu;
const WHY =
  'Only MySQL indexes a foreign-key column by itself; PostgreSQL, SQL Server and SQLite do not, so every delete of a referenced row, and every join or lookup by the column, scans the whole table once it grows.';
const EXCEPTION =
  'An exception fits only when the table is known to stay small or the index is created outside the repository.';

function isUpMigration(file: string): boolean {
  return isMigrationFile(file) && !DOWN_FILE.test(file) && graphCandidate(file)?.kind !== 'django';
}

function schemaFiles({ projectRoot, files, parseYaml }: SchemaContext): SchemaEntry[] {
  const sqlc = sqlcSchemaFiles(projectRoot, files, parseYaml);
  const migrations = files
    .filter(isUpMigration)
    .map((file) => ({ file, declared: false, mysql: sqlc.mysql.has(file) }));
  const declared = sqlc.checked
    .filter((file) => !isUpMigration(file))
    .map((file) => ({ file, declared: true, mysql: false }));
  return [...migrations, ...declared];
}

function migrationSchemas(
  projectRoot: string,
  entries: readonly SchemaEntry[],
  parseYaml?: ParseYaml,
): MigrationSchema[] {
  return entries.flatMap(({ file, declared }) => {
    const text = readSource(projectRoot, file);
    return text === undefined || isMysqlDialect(file, text)
      ? []
      : [{ file, text, declared, schema: migrationSchema(file, text, parseYaml) }];
  });
}

function isCovered(foreignKey: ForeignKeyFact, indexes: readonly IndexFact[]): boolean {
  return indexes.some(
    (index) => index.table === foreignKey.table && leadsWith(index.columns, foreignKey.columns),
  );
}

function finding({
  path,
  key,
  line,
  message,
}: {
  readonly path: string;
  readonly key: string;
  readonly line: number;
  readonly message: string;
}): FindingDraft {
  return {
    tool: undefined,
    rule: RULE,
    path,
    identity: `${RULE}|${path}|${key}`,
    message: `${message} ${WHY} ${EXCEPTION} ${exceptionSentence(exceptionEntryText({ rule: RULE, path }))}`,
    classification: 'enforceable',
    location: { line },
  };
}

function indexHint(
  { file, declared }: Pick<SchemaEntry, 'file' | 'declared'>,
  table: string,
  columns: string,
): string {
  if (declared) {
    return `Add \`CREATE INDEX ON ${table} (${columns})\` to the schema.`;
  }
  if (CHANGELOG_FILE.test(file)) {
    return `Add a createIndex change on ${table} (${columns}) to the changelog.`;
  }
  if (graphCandidate(file)?.kind === 'alembic') {
    const listed = columns.split(', ').map((column) => `'${column}'`);
    return `Add \`op.create_index(None, '${table}', [${listed.join(', ')}])\` in a revision, or \`index=True\` on the column followed by a generated revision.`;
  }
  return `Add \`CREATE INDEX ON ${table} (${columns})\` in a migration, or the ORM's index on the field followed by a generated migration.`;
}

function migrationFinding(
  { file, text, declared }: MigrationSchema,
  foreignKey: NamedForeignKey,
  ordinal: number,
): FindingDraft {
  const columns = foreignKey.columns.join(', ');
  const line = lineAt(text, foreignKey.at);
  const key = `${foreignKey.table}(${columns})`;
  const target = `${foreignKey.table} (${columns})`;
  const verb = declared ? 'declares' : 'adds';
  return finding({
    path: file,
    key: ordinal === 0 ? key : `${key}#${String(ordinal + 1)}`,
    line,
    message: [
      `${file} ${verb} a foreign key on ${target} (line ${String(line)})`,
      `and no ${declared ? 'schema file' : 'migration'} creates an index that starts with it.`,
      indexHint({ file, declared }, foreignKey.table, columns),
    ].join(' '),
  });
}

function fileFindings(entry: MigrationSchema, indexes: readonly IndexFact[]): FindingDraft[] {
  const seen = new Map<string, number>();
  return entry.schema.foreignKeys
    .filter(
      (foreignKey): foreignKey is NamedForeignKey =>
        foreignKey.table !== undefined && foreignKey.columns.length > 0,
    )
    .filter((foreignKey) => !isCovered(foreignKey, indexes))
    .map((foreignKey) => {
      const key = JSON.stringify([foreignKey.table, foreignKey.columns]);
      const ordinal = seen.get(key) ?? 0;
      seen.set(key, ordinal + 1);
      return migrationFinding(entry, foreignKey, ordinal);
    });
}

function prismaFinding(relation: PrismaRelation): FindingDraft {
  const columns = relation.columns.join(', ');
  return finding({
    path: relation.file,
    key: `${relation.model}.${relation.field}`,
    line: relation.line,
    message: [
      `${relation.file}: the relation ${relation.model}.${relation.field} (line ${String(relation.line)}) stores its foreign key in ${columns}, and no @@index, @@unique or @@id of ${relation.model} starts with it.`,
      `Add \`@@index([${columns}])\` to ${relation.model}.`,
    ].join(' '),
  });
}

export function migratesForeignKeys(
  projectRoot: string,
  files: readonly string[],
  parseYaml?: ParseYaml,
): boolean {
  return migrationSchemas(
    projectRoot,
    schemaFiles({ projectRoot, files, parseYaml }),
    parseYaml,
  ).some(({ schema }) => schema.foreignKeys.length > 0);
}

export function foreignKeyIndexFindings(
  tool: string,
  { projectRoot, files, parseYaml }: SchemaContext,
): Finding[] {
  const kindOf = databaseKinds(projectRoot, files);
  const entries = schemaFiles({ projectRoot, files, parseYaml }).filter(
    ({ file, declared, mysql }) => !mysql && (declared || kindOf(file) !== MYSQL),
  );
  const schemas = migrationSchemas(projectRoot, entries, parseYaml);
  const indexes = schemas.flatMap(({ schema }) => schema.indexes);
  const migrations = schemas.flatMap((entry) => fileFindings(entry, indexes));
  const prisma = unindexedPrismaRelations(projectRoot, files)
    .filter((relation) => kindOf(relation.file) !== MYSQL)
    .map(prismaFinding);
  return [...migrations, ...prisma].map((found) => ({ ...found, tool }));
}
