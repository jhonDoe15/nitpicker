import { isQueryResult, queryScope } from './query-calls.mjs';
import { AGGREGATE, COUNT, FILTER, SORT, resultSite, useOf } from './result-uses.mjs';

const EXCEPTION =
  'An exception fits only for a small fixed lookup list that is meant to be loaded whole.';

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow loading query rows only to count, filter, sort or aggregate them in memory, when the database could',
    },
    schema: [],
    messages: {
      [COUNT]: `These rows are loaded only to count them or to check that there are none. Ask the database instead: count (TypeORM, Prisma, Sequelize, MikroORM), exists or existsBy (TypeORM), findFirst (Prisma), or select({ value: count() }) in Drizzle. ${EXCEPTION}`,
      [FILTER]: `These rows are loaded and then filtered on their columns in memory. Put the condition in the query: where (TypeORM, Prisma, Sequelize), the filter argument of MikroORM find, or .where() in Drizzle; for some, every or find, an exists, count or findFirst query. ${EXCEPTION}`,
      [SORT]: `These rows are sorted in memory by their columns. Sort in the query: order (TypeORM, Sequelize), orderBy (Prisma, MikroORM), or .orderBy() in Drizzle. ${EXCEPTION}`,
      [AGGREGATE]: `These rows are loaded only to sum, find the largest or smallest, or group them in memory. Let the database aggregate: sum, maximum or minimum (TypeORM), aggregate or groupBy (Prisma), sum, max, min or group (Sequelize), a query builder with groupBy (MikroORM), or sum(), max() and groupBy() in Drizzle. ${EXCEPTION}`,
    },
  },
  create(context) {
    const scope = queryScope(context);
    return {
      AwaitExpression(node) {
        if (!isQueryResult(scope, node)) {
          return;
        }
        const site = resultSite(context, node);
        const use = site === undefined ? undefined : useOf(context, site);
        if (use !== undefined) {
          context.report({ node: use.node, messageId: use.shape });
        }
      },
    };
  },
};
