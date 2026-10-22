const PERSISTENCE = [
  ['@prisma/client', /^(?:PrismaClient|TransactionClient|\w+Delegate)$/u],
  ['knex', /^(?:Knex|Transaction|QueryBuilder)$/u],
  ['pg', /^(?:Pool|PoolClient|Client|QueryResult)$/u],
  ['mysql', /^(?:Connection|Pool|PoolConnection)$/u],
  ['mysql2', /^(?:Connection|Pool|PoolConnection)$/u],
  ['mongodb', /^(?:MongoClient|Db|Collection|ClientSession|FindCursor|AggregationCursor)$/u],
  ['mongoose', /^(?:Connection|ClientSession|Model|Query)$/u],
  [
    'typeorm',
    /^(?:DataSource|Connection|EntityManager|QueryRunner|Repository|TreeRepository|MongoRepository|SelectQueryBuilder)$/u,
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

const TRANSPORT = [
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

export function packageOf(fileName) {
  const normalized = fileName.replaceAll('\\', '/');
  const index = normalized.lastIndexOf(NODE_MODULES);
  if (index === -1) {
    return undefined;
  }
  const [first, second] = normalized.slice(index + NODE_MODULES.length).split('/');
  if (first === '.prisma') {
    return '@prisma/client';
  }
  const name = first.startsWith('@') ? `${first}/${second}` : first;
  return name.startsWith('@types/') ? typesPackage(name.slice('@types/'.length)) : name;
}

function typesPackage(name) {
  return name.includes('__') ? `@${name.replace('__', '/')}` : name;
}

function matchesPackage(pattern, name) {
  return pattern.endsWith('/*') ? name.startsWith(pattern.slice(0, -1)) : pattern === name;
}

function kindIn(table, name, symbolName) {
  return table.some(([pattern, names]) => matchesPackage(pattern, name) && names.test(symbolName));
}

export function infrastructureOf(symbol) {
  const declaration = symbol?.declarations?.[0];
  const packageName =
    declaration === undefined ? undefined : packageOf(declaration.getSourceFile().fileName);
  if (packageName === undefined) {
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
