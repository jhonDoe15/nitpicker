import path from 'node:path';
import { graphCandidate } from '../migrations/migration-files.mjs';
import { alembicSchema } from './statements/alembic-statements.mjs';
import { xmlSchema, yamlSchema } from './statements/changelog-statements.mjs';
import { sqlSchema } from './statements/sql-statements.mjs';

const UP =
  /\b(?:async\s+)?up\s*\(|\bdef\s+upgrade\s*\(|\bfunc\s+Up\w*\s*\(|^--\s*\+goose\s+Up|^--\s*migrate:up/imu;
const DOWN =
  /\b(?:async\s+)?down\s*\(|\bdef\s+downgrade\s*\(|\bfunc\s+Down\w*\s*\(|^--\s*\+goose\s+Down|^--\s*migrate:down/imu;
const LITERAL =
  /"""[\s\S]*?"""|'''[\s\S]*?'''|`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/gu;
const NOT_NEWLINE = /[^\n]/gu;
const ESCAPED_QUOTE = /\\(["'`])/gu;
const MYSQL_SQL = /`|\bENGINE\s*=/iu;
const MYSQL_CODE = /\\`|\bENGINE\s*=/iu;
const SQL_FILE = /\.sql$/iu;
const XML_FILE = /\.xml$/iu;
const YAML_FILE = /\.(?:ya?ml|json)$/iu;
const DELIMITERS = /^(?:"""|'''|["'`])|(?:"""|'''|["'`])$/gu;

function upSection(text) {
  const start = UP.exec(text)?.index ?? 0;
  const down = DOWN.exec(text.slice(start));
  const before = text.slice(0, start).replaceAll(NOT_NEWLINE, ' ');
  return before + (down === null ? text.slice(start) : text.slice(start, start + down.index));
}

function unescaped(content) {
  return content
    .split('\n')
    .map((line) => {
      const plain = line.replaceAll(ESCAPED_QUOTE, '$1');
      return plain + ' '.repeat(line.length - plain.length);
    })
    .join('\n');
}

function merged(schemas) {
  return {
    foreignKeys: schemas.flatMap((schema) => schema.foreignKeys),
    indexes: schemas.flatMap((schema) => schema.indexes),
  };
}

function stringSchemas(text) {
  return [...text.matchAll(LITERAL)].map((match) => {
    const [literal] = match;
    const opening = /^(?:"""|'''|["'`])/u.exec(literal)[0].length;
    const content = unescaped(literal.replaceAll(DELIMITERS, ''));
    return sqlSchema(content, match.index + opening);
  });
}

export function leadsWith(indexColumns, columns) {
  const lead = new Set(indexColumns.slice(0, columns.length));
  return columns.length > 0 && columns.every((column) => lead.has(column));
}

export function isMysqlDialect(file, text) {
  return (SQL_FILE.test(file) ? MYSQL_SQL : MYSQL_CODE).test(text);
}

export function migrationSchema(file, text, parseYaml) {
  const base = path.posix.basename(file);
  if (XML_FILE.test(base)) {
    return xmlSchema(text);
  }
  if (YAML_FILE.test(base)) {
    return yamlSchema(text, parseYaml);
  }
  const up = upSection(text);
  if (SQL_FILE.test(base)) {
    return sqlSchema(up);
  }
  const alembic = graphCandidate(file)?.kind === 'alembic' ? [alembicSchema(up)] : [];
  return merged([...alembic, ...stringSchemas(up)]);
}
