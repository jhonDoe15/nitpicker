import path from 'node:path';
import { readSource } from '../migrations/revision-graph.mts';
import { ancestorFolders } from './database-kind.mts';
import { leadsWith } from './migration-schema.mts';
import type { ColumnName, PrismaRelation } from './schema-types.mts';

type Block = {
  readonly kind: string;
  readonly name: string;
  readonly lines: { readonly text: string; readonly line: number }[];
};

const BLOCK_START = /^\s*(model|datasource)\s+(\w+)\s*\{/u;
const BLOCK_END = /^\s*\}/u;
const PROVIDER = /\bprovider\s*=\s*"([^"]+)"/u;
const RELATION_MODE = /\brelationMode\s*=\s*"prisma"/u;
const RELATION_FIELDS = /@relation\s*\([^)]*?\bfields\s*:\s*\[([^\]]*)\]/u;
const BLOCK_INDEX = /@@(?:index|unique|id)\s*\(\s*(?:fields\s*:\s*)?\[([^\]]*)\]/gu;
const FIELD = /^\s*(\w+)\s+\w/u;
const KEYED_FIELD = /@(?:id|unique)\b/u;
const COMMENT = /\/\/[^\n]*/gu;
const CHECKED_PROVIDERS = new Set(['postgresql', 'postgres', 'cockroachdb']);
const MYSQL = 'mysql';

function names(list: string): string[] {
  return list
    .split(',')
    .map((entry) => (entry.trim().split('(')[0] ?? '').trim())
    .filter(Boolean);
}

function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  let open: Block | undefined;
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    const start = BLOCK_START.exec(line);
    if (start !== null) {
      const block: Block = { kind: start[1] ?? '', name: start[2] ?? '', lines: [] };
      blocks.push(block);
      open = line.includes('}', start[0].length) ? undefined : block;
    } else if (BLOCK_END.test(line)) {
      open = undefined;
    } else {
      open?.lines.push({ text: line, line: index + 1 });
    }
  }
  return blocks;
}

function bodyOf(block: Block): string {
  return block.lines.map(({ text }) => text).join('\n');
}

function isChecked(body = ''): boolean {
  const provider = PROVIDER.exec(body)?.[1];
  if (provider === undefined || CHECKED_PROVIDERS.has(provider) || provider.startsWith('env')) {
    return true;
  }
  return provider === MYSQL && RELATION_MODE.test(body);
}

function modelIndexes(block: Block): ColumnName[][] {
  const listed = [...bodyOf(block).matchAll(BLOCK_INDEX)].map(([, list]) => names(list ?? ''));
  const keyed = block.lines
    .filter(({ text }) => KEYED_FIELD.test(text))
    .map(({ text }): ColumnName[] => [FIELD.exec(text)?.[1]]);
  return [...listed, ...keyed];
}

function modelRelations(block: Block): Omit<PrismaRelation, 'file'>[] {
  const indexes = modelIndexes(block);
  return block.lines.flatMap(({ text, line }) => {
    const fields = RELATION_FIELDS.exec(text)?.[1];
    const columns = fields === undefined ? [] : names(fields);
    const covered = indexes.some((index) => leadsWith(index, columns));
    return columns.length === 0 || covered
      ? []
      : [{ model: block.name, field: FIELD.exec(text)?.[1] ?? '', columns, line }];
  });
}

function hasMigrations(schemaFile: string, files: readonly string[]): boolean {
  const prefixes = ancestorFolders(schemaFile).map((folder) =>
    folder === '.' ? 'migrations/' : `${folder}/migrations/`,
  );
  return files.some(
    (file) => file.endsWith('/migration.sql') && prefixes.some((prefix) => file.startsWith(prefix)),
  );
}

function datasourceFor(file: string, datasources: ReadonlyMap<string, string>): string | undefined {
  const folder = ancestorFolders(file).find((candidate) => datasources.has(candidate));
  return folder === undefined ? undefined : datasources.get(folder);
}

function parsedSchemas(
  projectRoot: string,
  files: readonly string[],
): { readonly file: string; readonly blocks: Block[] }[] {
  return files
    .filter((file) => file.endsWith('.prisma'))
    .flatMap((file) => {
      const raw = readSource(projectRoot, file);
      return raw === undefined ? [] : [{ file, blocks: blocksOf(raw.replace(COMMENT, '')) }];
    });
}

export function unindexedPrismaRelations(
  projectRoot: string,
  files: readonly string[],
): PrismaRelation[] {
  const schemas = parsedSchemas(projectRoot, files);
  const datasources = new Map(
    schemas.flatMap(({ file, blocks }) => {
      const datasource = blocks.find((block) => block.kind === 'datasource');
      return datasource === undefined
        ? []
        : [[path.posix.dirname(file), bodyOf(datasource)] satisfies [string, string]];
    }),
  );
  return schemas
    .filter(
      ({ file }) => !hasMigrations(file, files) && isChecked(datasourceFor(file, datasources)),
    )
    .flatMap(({ file, blocks }) =>
      blocks
        .filter((block) => block.kind === 'model')
        .flatMap((block) => modelRelations(block).map((relation) => ({ file, ...relation }))),
    );
}
