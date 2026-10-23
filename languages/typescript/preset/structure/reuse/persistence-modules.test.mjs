import { describe, expect, it } from 'vitest';
import { persistenceOfModule } from './persistence-modules.mjs';

function fact(imports, dynamicImports = []) {
  return {
    imports: imports.map(({ specifier, names = [], whole = false, typeOnly = false }) => ({
      specifier,
      defaultName: whole ? 'client' : undefined,
      namespaceName: undefined,
      typeOnly,
      named: names.map((name) => ({ imported: name, local: name, typeOnly })),
    })),
    dynamicImports,
  };
}

describe('persistenceOfModule', () => {
  it('marks modules that define ORM entities or tables', () => {
    const modules = [
      fact([{ specifier: 'typeorm', names: ['Entity', 'Column'] }]),
      fact([{ specifier: '@mikro-orm/core', names: ['Entity', 'Property'] }]),
      fact([{ specifier: 'drizzle-orm/pg-core', names: ['pgTable', 'text'] }]),
      fact([{ specifier: 'mongoose', names: ['Schema', 'model'] }]),
      fact([{ specifier: 'sequelize-typescript', names: ['Table', 'Model'] }]),
    ];

    expect(modules.map(persistenceOfModule)).toEqual(modules.map(() => 'entity'));
  });

  it('marks modules that use a database client or ORM session as data access', () => {
    const modules = [
      fact([{ specifier: 'pg', names: ['Pool'] }]),
      fact([{ specifier: '@prisma/client', names: ['PrismaClient'] }]),
      fact([{ specifier: 'typeorm', names: ['DataSource'] }]),
      fact([{ specifier: '@nestjs/typeorm', names: ['InjectRepository'] }]),
      fact([{ specifier: 'drizzle-orm', names: ['eq'] }]),
      fact([{ specifier: 'knex', whole: true }]),
      fact([{ specifier: '@aws-sdk/lib-dynamodb', names: ['DynamoDBDocumentClient'] }]),
      fact([], ['ioredis']),
    ];

    expect(modules.map(persistenceOfModule)).toEqual(modules.map(() => 'data-access'));
  });

  it('leaves read models, mapping-only imports, type-only imports and other packages alone', () => {
    const modules = [
      fact([{ specifier: 'typeorm', names: ['ViewEntity', 'ViewColumn'] }]),
      fact([{ specifier: 'typeorm', names: ['Column'] }]),
      fact([{ specifier: '@prisma/client', names: ['User'], typeOnly: true }]),
      fact([{ specifier: 'axios', whole: true }]),
      fact([{ specifier: 'pgx', names: ['x'] }]),
      fact([]),
    ];

    expect(modules.map(persistenceOfModule)).toEqual(modules.map(() => undefined));
  });
});
