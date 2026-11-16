const PRISMA = 'prisma';
const SEQUELIZE = 'sequelize';
const PACKAGE_ORMS = new Map([
  ['typeorm', 'typeorm'],
  ['@prisma/client', PRISMA],
  [PRISMA, PRISMA],
  ['drizzle-orm', 'drizzle'],
  ['kysely', 'kysely'],
  ['knex', 'knex'],
  [SEQUELIZE, SEQUELIZE],
  ['sequelize-typescript', SEQUELIZE],
]);
const MIKRO_SCOPE = '@mikro-orm/';

export function ormsOf(dependencyNames: readonly string[]): string[] {
  const orms = dependencyNames.flatMap((name): string[] => {
    if (name.startsWith(MIKRO_SCOPE)) {
      return ['mikro'];
    }
    const orm = PACKAGE_ORMS.get(name);
    return orm === undefined ? [] : [orm];
  });
  return [...new Set(orms)].toSorted((left, right) => left.localeCompare(right));
}
