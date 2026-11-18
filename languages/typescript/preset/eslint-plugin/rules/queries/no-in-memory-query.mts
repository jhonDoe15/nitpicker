import { AST_NODE_TYPES, type TSESLint } from '@typescript-eslint/utils';
import { isQueryResult, queryScope } from './query-calls.mts';
import { isForeignCall } from './receivers/orm-callee.mts';
import { isLockedRead } from './receivers/locked-reads.mts';
import { unwrapped } from '../security/security-values.mts';
import { AGGREGATE, COUNT, FILTER, SORT, resultSite, useOf } from './result-uses.mts';

const EXCEPTION =
  'An exception fits only for a small fixed lookup list that is meant to be loaded whole.';

export const rule: TSESLint.RuleModule<
  typeof COUNT | typeof FILTER | typeof SORT | typeof AGGREGATE,
  readonly []
> = {
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
        const call = unwrapped(node.argument);
        const query = call.type === AST_NODE_TYPES.CallExpression ? call : undefined;
        const skipped =
          query === undefined || isForeignCall(context, query) || isLockedRead(query);
        if (skipped || !isQueryResult(scope, node)) {
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
