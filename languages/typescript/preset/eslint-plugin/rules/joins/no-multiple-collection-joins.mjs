import { findJoins } from './find-options.mjs';
import { builderJoins, isQueryBuilder } from './query-builders.mjs';
import { crossedCollections, relationTypes } from './relation-types.mjs';
import { includeJoins } from './sequelize-includes.mjs';

const PRODUCT =
  '{{first}} and {{second}} are both to-many relations joined into one query, so the database returns every {{first}} row once for each {{second}} row.';
const EXCEPTION = 'An exception fits only when both relations are known to stay small.';

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow joining two or more to-many relations into one query (TypeORM relations and joins, Sequelize include, MikroORM joined populate)',
    },
    schema: [],
    messages: {
      typeorm: `${PRODUCT} Load the collections in separate queries: relationLoadStrategy: 'query' in the find options, or one find per collection in Promise.all. ${EXCEPTION}`,
      sequelize: `${PRODUCT} Load the collections in separate queries: separate: true on the hasMany include, or one query per collection in Promise.all. ${EXCEPTION}`,
      mikroOrm: `${PRODUCT} Load the collections in separate queries: strategy: 'select-in' (LoadStrategy.SELECT_IN) on this find, or one populate per collection. ${EXCEPTION}`,
    },
  },
  create(context) {
    const types = relationTypes(context);
    if (types === undefined) {
      return {};
    }

    function report(join) {
      const crossed = join === undefined ? undefined : crossedCollections(join.joined);
      if (crossed !== undefined) {
        context.report({ node: join.node, messageId: join.orm, data: crossed });
      }
    }

    return {
      CallExpression(node) {
        if (isQueryBuilder(types, node)) {
          report(builderJoins(context, types, node));
          return;
        }
        report(findJoins(context, types, node));
        for (const join of includeJoins(context, types, node)) {
          report(join);
        }
      },
    };
  },
};
