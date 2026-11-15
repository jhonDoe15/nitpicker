import type TypeScript from 'typescript';
import { isGeneratedPrismaClient } from './prisma-client.mts';

type Table = readonly (readonly [string, RegExp])[];
export type Infrastructure =
  | { readonly kind: 'persistence'; readonly name: string; readonly packageName: string }
  | {
      readonly kind: 'transport';
      readonly name: string;
      readonly packageName: string;
      readonly request: boolean;
    };

const PERSISTENCE: Table = [
  ['@prisma/client', /^(?:PrismaClient|TransactionClient|\w+Delegate)$/u],
  ['knex', /^(?:Knex|Transaction|QueryBuilder)$/u],
  ['pg', /^(?:Pool|PoolClient|Client|QueryResult)$/u],
  ['mysql', /^(?:Connection|Pool|PoolConnection)$/u],
  ['mysql2', /^(?:Connection|Pool|PoolConnection)$/u],
  ['mongodb', /^(?:MongoClient|Db|Collection|ClientSession|FindCursor|AggregationCursor)$/u],
  ['mongoose', /^(?:Connection|ClientSession|Model|Query)$/u],
  [
    'typeorm',
    /^(?:DataSource|Connection|EntityManager|QueryRunner|(?:Tree|Mongo)?Repository|SelectQueryBuilder)$/u,
  ],
  ['sequelize', /^(?:Sequelize|Transaction)$/u],
  ['drizzle-orm', /(?:Database|Transaction)$/u],
  ['kysely', /^(?:Kysely|Transaction)$/u],
  ['better-sqlite3', /^(?:Database|Statement)$/u],
  ['sqlite3', /^(?:Database|Statement)$/u],
  ['@libsql/client', /^(?:Client|Transaction)$/u],
  ['postgres', /^(?:Sql|TransactionSql)$/u],
  ['@mikro-orm/*', /^(?:EntityManager|MikroORM|EntityRepository)$/u],
];

const TRANSPORT: Table = [
  ['express', /^(?:Request|Response)$/u],
  ['express-serve-static-core', /^(?:Request|Response)$/u],
  ['fastify', /^(?:FastifyRequest|FastifyReply)$/u],
  ['koa', /^(?:Context|ParameterizedContext|ExtendableContext|Request|Response)$/u],
  ['hono', /^Context$/u],
  ['next', /^(?:NextRequest|NextResponse)$/u],
  ['node', /^(?:IncomingMessage|ServerResponse)$/u],
];

const REQUEST_NAMES =
  /^(?:Request|FastifyRequest|Context|ParameterizedContext|ExtendableContext|NextRequest|IncomingMessage)$/u;

const NODE_MODULES = '/node_modules/';
const PRISMA_CLIENT = '@prisma/client';

export function packageOf(fileName: string): string | undefined {
  const normalized = fileName.replaceAll('\\', '/');
  const index = normalized.lastIndexOf(NODE_MODULES);
  if (index === -1) {
    return isGeneratedPrismaClient(fileName) ? PRISMA_CLIENT : undefined;
  }
  const [first = '', second = ''] = normalized.slice(index + NODE_MODULES.length).split('/');
  if (first === '.prisma') {
    return PRISMA_CLIENT;
  }
  const name = first.startsWith('@') ? `${first}/${second}` : first;
  return name.startsWith('@types/') ? typesPackage(name.slice('@types/'.length)) : name;
}

function typesPackage(name: string): string {
  return name.includes('__') ? `@${name.replace('__', '/')}` : name;
}

function matchesPackage(pattern: string, name: string): boolean {
  return pattern.endsWith('/*') ? name.startsWith(pattern.slice(0, -1)) : pattern === name;
}

function kindIn(table: Table, name: string, symbolName: string): boolean {
  return table.some(([pattern, names]) => matchesPackage(pattern, name) && names.test(symbolName));
}

export function infrastructureOf(
  symbol: TypeScript.Symbol | undefined,
): Infrastructure | undefined {
  const declaration = symbol?.declarations?.[0];
  const packageName =
    declaration === undefined ? undefined : packageOf(declaration.getSourceFile().fileName);
  if (symbol === undefined || packageName === undefined) {
    return undefined;
  }
  if (kindIn(PERSISTENCE, packageName, symbol.name)) {
    return { kind: 'persistence', name: symbol.name, packageName };
  }
  return kindIn(TRANSPORT, packageName, symbol.name)
    ? {
        kind: 'transport',
        name: symbol.name,
        packageName,
        request: REQUEST_NAMES.test(symbol.name),
      }
    : undefined;
}
