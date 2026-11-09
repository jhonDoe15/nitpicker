import { exceptionEntryText, exceptionSentence } from '../../messages/exception-sentence.mjs';
import { HYGIENE_RULE_IDS } from '../../project-rules/hygiene-rules.mjs';
import { graphCandidate, isMigrationFile } from '../migrations/migration-files.mjs';
import { readSource } from '../migrations/revision-graph.mjs';
import { databaseKind } from './database-kind.mjs';
import { isMysqlDialect, migrationSchema } from './migration-schema.mjs';
import { unindexedPrismaRelations } from './prisma-schema.mjs';

const RULE = HYGIENE_RULE_IDS.foreignKeyIndex;
const MYSQL = 'mysql';
const WHY =
  'PostgreSQL does not index a foreign-key column by itself, so every delete of a referenced row, and every join or lookup by the column, scans the whole table once it grows.';
const EXCEPTION =
  'An exception fits only when the table is known to stay small or the index is created outside the repository.';

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function migrationSchemas(projectRoot, files) {
  return files
    .filter((file) => isMigrationFile(file) && graphCandidate(file)?.kind !== 'django')
    .flatMap((file) => {
      const text = readSource(projectRoot, file);
      return text === undefined || isMysqlDialect(file, text)
        ? []
        : [{ file, text, schema: migrationSchema(file, text) }];
    });
}

function isCovered(foreignKey, indexes) {
  const { columns } = foreignKey;
  return indexes.some((index) => {
    const lead = new Set(index.columns.slice(0, columns.length));
    return index.table === foreignKey.table && columns.every((column) => lead.has(column));
  });
}

function finding({ path, key, line, message }) {
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

function migrationFinding({ file, text }, foreignKey) {
  const columns = foreignKey.columns.join(', ');
  return finding({
    path: file,
    key: `${foreignKey.table}(${columns})`,
    line: lineOf(text, foreignKey.at),
    message: [
      `${file} adds a foreign key on ${foreignKey.table} (${columns}) (line ${String(lineOf(text, foreignKey.at))})`,
      'and no migration creates an index that starts with it.',
      `Add \`CREATE INDEX ON ${foreignKey.table} (${columns})\` in a migration, or the ORM's index on the field followed by a generated migration.`,
    ].join(' '),
  });
}

function prismaFinding(relation) {
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

export function foreignKeyIndexFindings(tool, { projectRoot, files }) {
  if (databaseKind(projectRoot, files) === MYSQL) {
    return [];
  }
  const schemas = migrationSchemas(projectRoot, files);
  const indexes = schemas.flatMap(({ schema }) => schema.indexes);
  const migrations = schemas.flatMap((entry) =>
    entry.schema.foreignKeys
      .filter((foreignKey) => foreignKey.table !== undefined && foreignKey.columns.length > 0)
      .filter((foreignKey) => !isCovered(foreignKey, indexes))
      .map((foreignKey) => migrationFinding(entry, foreignKey)),
  );
  const prisma = unindexedPrismaRelations(projectRoot, files).map(prismaFinding);
  return [...migrations, ...prisma].map((found) => ({ ...found, tool }));
}
