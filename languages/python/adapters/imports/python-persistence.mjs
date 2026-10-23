import { readFileSync } from 'node:fs';
import path from 'node:path';
import { aliases } from './import-aliases.mjs';

const DRIVERS = new Set([
  'sqlite3',
  'psycopg',
  'psycopg2',
  'asyncpg',
  'aiopg',
  'pymysql',
  'MySQLdb',
  'aiomysql',
  'pymongo',
  'motor',
  'redis',
  'cassandra',
  'elasticsearch',
  'aiosqlite',
  'databases',
]);
const ORMS = new Set(['sqlalchemy', 'sqlmodel', 'peewee', 'pony', 'tortoise', 'django']);
const QUERY_NAMES = new Set([
  'Session',
  'AsyncSession',
  'sessionmaker',
  'async_sessionmaker',
  'scoped_session',
  'create_engine',
  'create_async_engine',
  'Engine',
  'AsyncEngine',
  'Connection',
  'select',
  'insert',
  'update',
  'delete',
  'text',
  'connection',
  'connections',
  'db_session',
  'Tortoise',
  'in_transaction',
  'Database',
  'SqliteDatabase',
  'PostgresqlDatabase',
  'MySQLDatabase',
]);
const ENTITY_BASES = new Set([
  'django.db.models.Model',
  'sqlalchemy.orm.DeclarativeBase',
  'sqlalchemy.orm.DeclarativeBaseNoMeta',
  'peewee.Model',
  'tortoise.models.Model',
  'tortoise.Model',
  'mongoengine.Document',
  'mongoengine.DynamicDocument',
  'beanie.Document',
  'odmantic.Model',
  'piccolo.table.Table',
]);
const TABLE_MODEL = 'sqlmodel.SQLModel';
const ORM_MODULES =
  /^(?:sqlalchemy|sqlmodel|flask_sqlalchemy|peewee|pony|tortoise|mongoengine|beanie|odmantic|piccolo|django\.db)(?:\.|$)/u;

function topOf(module) {
  return module.split('.')[0];
}

function accessesData(statement) {
  if (statement.typeOnly === true || statement.level > 0) {
    return false;
  }
  if (statement.module === null) {
    return statement.names.some((name) => DRIVERS.has(topOf(name)) || ORMS.has(topOf(name)));
  }
  const top = topOf(statement.module);
  return (
    DRIVERS.has(top) || (ORMS.has(top) && statement.names.some((name) => QUERY_NAMES.has(name)))
  );
}

function projectIndex(modules, classes) {
  const byFile = new Map(modules.map((entry) => [entry.file, entry]));
  const fileOfModule = new Map(modules.map(({ module, file }) => [module, file]));
  const known = new Map();
  for (const [file, { classes: found }] of Object.entries(classes)) {
    const module = byFile.get(file)?.module;
    for (const entry of module === undefined ? [] : found) {
      known.set(`${module}.${entry.name}`, { ...entry, file });
    }
  }
  return { byFile, fileOfModule, known, classes };
}

function qualified(written, file, index) {
  const [first, ...rest] = written.split('.');
  const names = aliases(index.classes[file]?.imports ?? [], index.byFile.get(file));
  const head = names.get(first) ?? `${index.byFile.get(file).module}.${first}`;
  return [head, ...rest].join('.');
}

function owningModule(name, index) {
  const parts = name.split('.');
  const prefixes = parts.map((_, size) => parts.slice(0, parts.length - size).join('.'));
  return prefixes.find((prefix) => index.fileOfModule.has(prefix));
}

function importsOrm(file, index) {
  return (index.classes[file]?.imports ?? []).some(({ module }) => ORM_MODULES.test(module ?? ''));
}

function isTableModel(entry, { projectRoot }) {
  const base = path.resolve(projectRoot);
  const full = path.resolve(base, entry.file);
  if (!full.startsWith(base + path.sep)) {
    return false;
  }
  const text = readFileSync(full, 'utf8');
  const header = new RegExp(String.raw`class\s+${entry.name.split('.').at(-1)}\s*\(([^)]*)\)`, 'u');
  return /\btable\s*=\s*True\b/u.test(header.exec(text)?.[1] ?? '');
}

function isEntityBase(name, context, seen) {
  if (ENTITY_BASES.has(name)) {
    return true;
  }
  const parent = context.index.known.get(name);
  if (parent !== undefined) {
    return isEntityClass(parent, context, seen);
  }
  const owner = owningModule(name, context.index);
  return owner !== undefined && importsOrm(context.index.fileOfModule.get(owner), context.index);
}

function isEntityClass(entry, context, seen = new Set()) {
  if (seen.has(entry)) {
    return false;
  }
  seen.add(entry);
  const bases = entry.bases.map((written) => qualified(written, entry.file, context.index));
  return (
    (bases.includes(TABLE_MODEL) && isTableModel(entry, context)) ||
    bases.some((name) => name !== TABLE_MODEL && isEntityBase(name, context, seen))
  );
}

function kindOf(entry, context) {
  const defined = (context.index.classes[entry.file]?.classes ?? []).map((found) => ({
    ...found,
    file: entry.file,
  }));
  if (defined.some((found) => isEntityClass(found, context))) {
    return 'entity';
  }
  return (context.imports[entry.file] ?? []).some(accessesData) ? 'data-access' : undefined;
}

export function pythonPersistence({ modules, imports }, { classes, projectRoot }) {
  const context = { index: projectIndex(modules, classes), imports, projectRoot };
  return new Map(
    modules
      .map((entry) => [entry.file, kindOf(entry, context)])
      .filter(([, kind]) => kind !== undefined),
  );
}
