import path from 'node:path';
import { readSource } from '../migrations/revision-graph.mjs';

const MODEL = /^\s*model\s+(\w+)\s*\{([\s\S]*?)^\s*\}/gmu;
const DATASOURCE = /^\s*datasource\s+\w+\s*\{([\s\S]*?)^\s*\}/mu;
const PROVIDER = /\bprovider\s*=\s*"([^"]+)"/u;
const RELATION_MODE = /\brelationMode\s*=\s*"prisma"/u;
const RELATION_FIELDS = /@relation\s*\([^)]*?\bfields\s*:\s*\[([^\]]*)\]/u;
const BLOCK_INDEX = /@@(?:index|unique|id)\s*\(\s*(?:fields\s*:\s*)?\[([^\]]*)\]/gu;
const FIELD = /^\s*(\w+)\s+\w/u;
const KEYED_FIELD = /@(?:id|unique)\b/u;
const COMMENT = /\/\/[^\n]*/gu;
const CHECKED_PROVIDERS = new Set(['postgresql', 'postgres', 'cockroachdb']);
const MYSQL = 'mysql';

function names(list) {
  return list
    .split(',')
    .map((entry) => entry.trim().split('(')[0].trim())
    .filter(Boolean);
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function isChecked(text) {
  const datasource = DATASOURCE.exec(text)?.[1];
  const provider = datasource === undefined ? undefined : PROVIDER.exec(datasource)?.[1];
  if (provider === undefined || CHECKED_PROVIDERS.has(provider) || provider.startsWith('env')) {
    return true;
  }
  return provider === MYSQL && RELATION_MODE.test(datasource);
}

function modelRelations(text, match) {
  const [, model, body] = match;
  const start = match.index + match[0].indexOf(body);
  const lines = body.split('\n');
  const indexes = [...body.matchAll(BLOCK_INDEX)].map(([, list]) => names(list));
  const keyed = lines.filter((line) => KEYED_FIELD.test(line)).map((line) => FIELD.exec(line)?.[1]);
  const covered = (columns) =>
    [...indexes, ...keyed.map((field) => [field])].some((index) => {
      const lead = new Set(index.slice(0, columns.length));
      return columns.length > 0 && columns.every((column) => lead.has(column));
    });
  let offset = start;
  return lines.flatMap((line) => {
    const at = offset;
    offset += line.length + 1;
    const fields = RELATION_FIELDS.exec(line)?.[1];
    const columns = fields === undefined ? [] : names(fields);
    return columns.length === 0 || covered(columns)
      ? []
      : [{ model, field: FIELD.exec(line)?.[1], columns, line: lineOf(text, at) }];
  });
}

function hasMigrations(schemaFile, files) {
  const folders = [
    path.posix.dirname(schemaFile),
    path.posix.dirname(path.posix.dirname(schemaFile)),
  ];
  return files.some(
    (file) =>
      file.endsWith('/migration.sql') &&
      folders.some((folder) => file.startsWith(`${folder}/migrations/`)),
  );
}

export function unindexedPrismaRelations(projectRoot, files) {
  const schemas = files.filter((file) => file.endsWith('.prisma'));
  return schemas
    .filter((file) => !hasMigrations(file, files))
    .flatMap((file) => {
      const raw = readSource(projectRoot, file);
      const text = raw?.replace(COMMENT, (comment) => ' '.repeat(comment.length));
      if (text === undefined || !isChecked(text)) {
        return [];
      }
      return [...text.matchAll(MODEL)].flatMap((match) =>
        modelRelations(text, match).map((relation) => ({ file, ...relation })),
      );
    });
}
