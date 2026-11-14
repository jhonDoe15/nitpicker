import { readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  ClassEntry,
  ClassesReport,
  ImportsReport,
  ImportStatement,
  PythonModule,
} from '../analysis/typed/python-graph-types.mts';
import { escapeRegExp as untypedEscape } from '../../../../shared/paths/glob.mjs';
import { aliases } from '../imports/import-aliases.mts';
import { entryOf } from '../imports/typed/import-rule-types.mts';

const escapeRegExp: (value: string) => string = untypedEscape;

type KnownClass = ClassEntry & { readonly file: string };
type ProjectIndex = {
  readonly byFile: ReadonlyMap<string, PythonModule>;
  readonly fileOfModule: ReadonlyMap<string, string>;
  readonly known: ReadonlyMap<string, KnownClass>;
  readonly classes: ClassesReport;
};
type PersistenceContext = {
  readonly index: ProjectIndex;
  readonly imports: ImportsReport['imports'];
  readonly projectRoot: string;
};

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
const ORM_PACKAGES = [
  'sqlalchemy',
  'sqlmodel',
  'flask_sqlalchemy',
  'peewee',
  'pony',
  'tortoise',
  'mongoengine',
  'beanie',
  'odmantic',
  'piccolo',
  'django\\.db',
];
const BUILTIN_TYPES =
  'object|type|str|int|float|complex|bool|bytes|bytearray|dict|list|tuple|set|frozenset';
const BUILTIN_BASES = new RegExp(
  String.raw`^(?:${BUILTIN_TYPES}|\w*(?:Error|Exception|Warning|Exit|Interrupt))$`,
  'u',
);
const DATA_MODULES = /^(?:sqlalchemy|sqlmodel|peewee|pony|tortoise|django\.db)(?:\.|$)/u;
const ORM_MODULES = new RegExp(`^(?:${ORM_PACKAGES.join('|')})(?:\\.|$)`, 'u');

function topOf(module: string): string {
  return module.split('.')[0] ?? '';
}

function accessesData(statement: ImportStatement): boolean {
  if (statement.typeOnly === true || statement.level > 0) {
    return false;
  }
  if (statement.module === null) {
    return statement.names.some((name) => DRIVERS.has(topOf(name)) || DATA_MODULES.test(name));
  }
  const top = topOf(statement.module);
  return (
    DRIVERS.has(top) || (ORMS.has(top) && statement.names.some((name) => QUERY_NAMES.has(name)))
  );
}

function projectIndex(modules: readonly PythonModule[], classes: ClassesReport): ProjectIndex {
  const byFile = new Map(modules.map((entry) => [entry.file, entry]));
  const fileOfModule = new Map(modules.map(({ module, file }) => [module, file]));
  const known = new Map<string, KnownClass>();
  for (const [file, { classes: found }] of Object.entries(classes)) {
    const module = byFile.get(file)?.module;
    for (const entry of module === undefined ? [] : found) {
      known.set(`${String(module)}.${entry.name}`, { ...entry, file });
    }
  }
  return { byFile, fileOfModule, known, classes };
}

function qualified(written: string, file: string, index: ProjectIndex): string {
  const [first = '', ...rest] = written.split('.');
  const names = aliases(index.classes[file]?.imports ?? [], entryOf(index.byFile, file));
  if (rest.length === 0 && !names.has(first) && BUILTIN_BASES.test(first)) {
    return `builtins.${first}`;
  }
  const head = names.get(first) ?? `${entryOf(index.byFile, file).module}.${first}`;
  return [head, ...rest].join('.');
}

function owningModule(name: string, index: ProjectIndex): string | undefined {
  const parts = name.split('.');
  const prefixes = parts.map((_, size) => parts.slice(0, parts.length - size).join('.'));
  return prefixes.find((prefix) => index.fileOfModule.has(prefix));
}

function importsOrm(file: string | undefined, index: ProjectIndex): boolean {
  return (index.classes[file ?? '']?.imports ?? []).some(({ module }) =>
    ORM_MODULES.test(module ?? ''),
  );
}

function isTableModel(entry: KnownClass, { projectRoot }: { projectRoot: string }): boolean {
  const base = path.resolve(projectRoot);
  const full = path.resolve(base, entry.file);
  if (!full.startsWith(base + path.sep)) {
    return false;
  }
  const text = readFileSync(full, 'utf8');
  const header = new RegExp(
    String.raw`class\s+${escapeRegExp(entry.name.split('.').at(-1) ?? '')}\s*\(([^)]*)\)`,
    'u',
  );
  return /\btable\s*=\s*True\b/u.test(header.exec(text)?.[1] ?? '');
}

function isEntityBase(name: string, context: PersistenceContext): boolean {
  if (ENTITY_BASES.has(name)) {
    return true;
  }
  const owner = owningModule(name, context.index);
  return (
    !context.index.known.has(name) &&
    owner !== undefined &&
    importsOrm(context.index.fileOfModule.get(owner), context.index)
  );
}

function isEntityClass(entry: KnownClass, context: PersistenceContext): boolean {
  const pending = [entry];
  const seen = new Set<KnownClass>();
  let reachesTableModel = false;
  for (const current of pending) {
    const bases = seen.has(current)
      ? []
      : current.bases.map((written) => qualified(written, current.file, context.index));
    seen.add(current);
    if (bases.some((name) => name !== TABLE_MODEL && isEntityBase(name, context))) {
      return true;
    }
    reachesTableModel ||= bases.includes(TABLE_MODEL);
    pending.push(
      ...bases.map((name) => context.index.known.get(name)).filter((found) => found !== undefined),
    );
  }
  return reachesTableModel && isTableModel(entry, context);
}

function kindOf(entry: PythonModule, context: PersistenceContext): string | undefined {
  const defined = (context.index.classes[entry.file]?.classes ?? []).map((found) => ({
    ...found,
    file: entry.file,
  }));
  if (defined.some((found) => isEntityClass(found, context))) {
    return 'entity';
  }
  return (context.imports[entry.file] ?? []).some(accessesData) ? 'data-access' : undefined;
}

export function pythonPersistence(
  { modules, imports }: ImportsReport,
  { classes, projectRoot }: { classes: ClassesReport; projectRoot: string },
): Map<string, string> {
  const context = { index: projectIndex(modules, classes), imports, projectRoot };
  return new Map(
    modules
      .map((entry): [string, string | undefined] => [entry.file, kindOf(entry, context)])
      .filter((pair): pair is [string, string] => pair[1] !== undefined),
  );
}
