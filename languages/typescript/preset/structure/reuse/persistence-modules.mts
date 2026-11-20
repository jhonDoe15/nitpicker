import type { Persistence, ReuseFact } from './typed/reuse-types.mts';

const DATABASE_PACKAGES = [
  'pg',
  'pg-promise',
  'postgres',
  'mysql',
  'mysql2',
  'mongodb',
  'mongoose',
  'redis',
  'ioredis',
  'sqlite3',
  'better-sqlite3',
  'knex',
  'kysely',
  'objection',
  'sequelize',
  'sequelize-typescript',
  'typeorm',
  '@nestjs/typeorm',
  'drizzle-orm',
  '@prisma/client',
  '@mikro-orm/[^/]+',
  '@libsql/client',
  '@planetscale/database',
  '@neondatabase/serverless',
  '@vercel/postgres',
  'cassandra-driver',
  '@elastic/elasticsearch',
  '@aws-sdk/client-dynamodb',
  '@aws-sdk/lib-dynamodb',
  '@google-cloud/firestore',
];
const DATABASE_PACKAGE = new RegExp(`^(?:${DATABASE_PACKAGES.join('|')})(?:/|$)`, 'u');
const ENTITY_MARKERS = [
  { specifier: /^(?:typeorm|@mikro-orm\/core)$/u, names: ['Entity'] },
  { specifier: /^sequelize-typescript$/u, names: ['Table'] },
  { specifier: /^sequelize$/u, names: ['Model'] },
  { specifier: /^mongoose$/u, names: ['Schema', 'model'] },
  { specifier: /^drizzle-orm\/pg-core$/u, names: ['pgTable', 'pgSchema'] },
  { specifier: /^drizzle-orm\/mysql-core$/u, names: ['mysqlTable'] },
  { specifier: /^drizzle-orm\/sqlite-core$/u, names: ['sqliteTable'] },
];
const READ_MODEL_MARKERS = [{ specifier: /^typeorm$/u, names: ['ViewEntity'] }];
const MAPPING_PACKAGE =
  /^(?:typeorm|@mikro-orm\/core|sequelize-typescript|drizzle-orm\/\w+-core)$/u;
const DATA_ACCESS_NAMES = new Set([
  'DataSource',
  'EntityManager',
  'Repository',
  'EntityRepository',
  'MikroORM',
  'Sequelize',
  'getRepository',
  'getConnection',
  'createConnection',
  'QueryRunner',
]);

const VALUE_IMPORTS = new Map<string, (name: string) => boolean>([
  ['@prisma/client', (name) => name !== 'PrismaClient'],
  [
    'mongoose',
    (name) => ['Types', 'SchemaTypes', 'isValidObjectId', 'isObjectIdOrHexString'].includes(name),
  ],
]);

type RuntimeImport = { specifier: string; whole: boolean; names: string[] };
type Marker = { readonly specifier: RegExp; readonly names: readonly string[] };

function runtimeImports(fact: Pick<ReuseFact, 'imports' | 'dynamicImports'>): RuntimeImport[] {
  return [
    ...fact.imports
      .filter(({ typeOnly }) => !typeOnly)
      .map(({ specifier, defaultName, namespaceName, named }) => ({
        specifier,
        whole: defaultName !== undefined || namespaceName !== undefined,
        names: named.filter(({ typeOnly }) => !typeOnly).map(({ imported }) => imported),
      })),
    ...fact.dynamicImports.map((specifier) => ({ specifier, whole: true, names: [] })),
  ].filter(({ specifier }) => DATABASE_PACKAGE.test(specifier));
}

function marked(imports: readonly RuntimeImport[], markers: readonly Marker[]): boolean {
  return imports.some(({ specifier, names }) =>
    markers.some(
      (marker) =>
        marker.specifier.test(specifier) && marker.names.some((name) => names.includes(name)),
    ),
  );
}

function onlyValues(specifier: string, names: readonly string[]): boolean {
  const isValue = VALUE_IMPORTS.get(specifier);
  return isValue !== undefined && names.every((name) => isValue(name));
}

function accessesData({ specifier, whole, names }: RuntimeImport): boolean {
  if (whole) {
    return true;
  }
  return MAPPING_PACKAGE.test(specifier)
    ? names.some((name) => DATA_ACCESS_NAMES.has(name))
    : !onlyValues(specifier, names);
}

export function persistenceOfModule(
  fact: Pick<ReuseFact, 'imports' | 'dynamicImports'>,
): Persistence | undefined {
  const imports = runtimeImports(fact);
  if (marked(imports, ENTITY_MARKERS)) {
    return 'entity';
  }
  if (marked(imports, READ_MODEL_MARKERS)) {
    return undefined;
  }
  return imports.some(accessesData) ? 'data-access' : undefined;
}
