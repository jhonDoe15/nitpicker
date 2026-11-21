import path from 'node:path';
import { isMigrationFile } from '../../migrations/migration-files.mts';
import { makeFact } from '../scanning/facts.mts';
import { alembicColumns, xmlColumns } from './changelog-columns.mts';
import { naturalOrder, sqlColumnDeclarations } from './sql-columns.mts';
import type { ColumnDeclaration, Fact, ReadText } from '../fact-types.mts';

const DOWN_FILE = /(?:^|[/._-])down\.sql$/iu;

function folderGroups(files: readonly string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const file of naturalOrder(files)) {
    const folder = path.posix.dirname(file);
    groups.set(folder, [...(groups.get(folder) ?? []), file]);
  }
  return [...groups.values()];
}

function declarationsOf(
  files: readonly string[],
  readText: ReadText,
): { readonly sql: ColumnDeclaration[]; readonly other: ColumnDeclaration[] } {
  const sql = sqlColumnDeclarations(
    files.filter((file) => file.endsWith('.sql') && !DOWN_FILE.test(file)),
    readText,
  );
  const other = files.flatMap((file) => {
    const text = file.endsWith('.xml') || file.endsWith('.py') ? readText(file) : undefined;
    if (text === undefined) {
      return [];
    }
    return file.endsWith('.xml') ? xmlColumns(file, text) : alembicColumns(file, text);
  });
  return { sql, other };
}

function finalColumns(declarations: readonly ColumnDeclaration[]): ColumnDeclaration[] {
  const final = new Map<string, ColumnDeclaration>();
  for (const declaration of declarations) {
    const key = `${declaration.table}.${declaration.column}`.toLowerCase();
    if (declaration.width === undefined) {
      final.delete(key);
    } else {
      final.set(key, declaration);
    }
  }
  return [...final.values()];
}

function factOf({ table, column, width, file, line }: ColumnDeclaration): Fact {
  return makeFact({
    kind: 'column',
    entityNames: [table],
    fieldNames: [column],
    label: `${table}.${column}`,
    file,
    line,
    style: 'sql',
    width,
  });
}

export function sqlColumnFacts(files: readonly string[], readText: ReadText): Fact[] {
  const candidates = files.filter(
    (file) =>
      (file.endsWith('.sql') || file.endsWith('.xml') || file.endsWith('.py')) &&
      !/(?:^|\/)node_modules\//u.test(file),
  );
  const alembic = candidates.filter((file) => file.endsWith('.py') && isMigrationFile(file));
  const rest = candidates.filter((file) => !file.endsWith('.py'));
  return folderGroups([...rest, ...alembic]).flatMap((group) => {
    const { sql, other } = declarationsOf(group, readText);
    return finalColumns([...sql, ...other]).map(factOf);
  });
}
