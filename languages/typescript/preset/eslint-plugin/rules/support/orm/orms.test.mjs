import { describe, expect, it } from 'vitest';
import { ormsOf } from './orms.mjs';

describe('ormsOf', () => {
  it('names the ORMs a project depends on', () => {
    expect(
      ormsOf([
        'react',
        '@prisma/client',
        'typeorm',
        '@mikro-orm/core',
        '@mikro-orm/postgresql',
        'knex',
      ]),
    ).toEqual(['knex', 'mikro', 'prisma', 'typeorm']);
    expect(ormsOf(['sequelize-typescript', 'kysely', 'drizzle-orm'])).toEqual([
      'drizzle',
      'kysely',
      'sequelize',
    ]);
  });

  it('is empty for a project with no ORM', () => {
    expect(ormsOf(['react', 'pg'])).toEqual([]);
  });
});
