import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { crossedCollections as untypedCrossedCollections } from '../../../../../../shared/joins/crossed-collections.mjs';
import { findJoins } from './find-options.mts';
import { builderJoins, isQueryBuilder } from './query-builders.mts';
import { relationTypes, type JoinSite, type Types } from './relation-types.mts';
import { includeJoins } from './sequelize-includes.mts';
import { suggestible } from '../../fixes/support/descriptors.mts';
import { joinStrategyFix } from '../../fixes/queries/joins/join-strategy-fix.mts';

type Crossed = { readonly first: string; readonly second: string };

const crossedCollections: (joined: ReadonlyMap<string, boolean>) => Crossed | undefined =
  untypedCrossedCollections;

const PRODUCT =
  '{{first}} and {{second}} are both to-many relations joined into one query, so the database returns every {{first}} row once for each {{second}} row.';
const EXCEPTION = 'An exception fits only when both relations are known to stay small.';

export const rule: TSESLint.RuleModule<
  'typeorm' | 'sequelize' | 'mikroOrm' | 'queryStrategy' | 'separate' | 'selectIn'
> = {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    docs: {
      description:
        'Disallow joining two or more to-many relations into one query (TypeORM relations and joins, Sequelize include, MikroORM joined populate)',
    },
    schema: [],
    messages: {
      typeorm: `${PRODUCT} Load the collections in separate queries: relationLoadStrategy: 'query' in the find options, or one find per collection in Promise.all. ${EXCEPTION}`,
      sequelize: `${PRODUCT} Load the collections in separate queries: separate: true on the hasMany include, or one query per collection in Promise.all. ${EXCEPTION}`,
      mikroOrm: `${PRODUCT} Load the collections in separate queries: strategy: 'select-in' (LoadStrategy.SELECT_IN) on this find, or one populate per collection. ${EXCEPTION}`,
      queryStrategy:
        "Load the relations with one query each: set relationLoadStrategy to 'query'. The queries do not share a snapshot unless they run in a transaction.",
      selectIn:
        "Load the collections with one query each: set strategy to 'select-in'. The queries do not share a snapshot unless they run in a transaction.",
      separate:
        'Load the collections with one query each: set separate: true on the hasMany includes after the first. The queries do not share a snapshot unless they run in a transaction.',
    },
  },
  create(context) {
    const types = relationTypes(context);
    if (types === undefined) {
      return {};
    }

    const checked: Types = types;

    function report(join: JoinSite | undefined, call: TSESTree.CallExpression): void {
      const crossed = join === undefined ? undefined : crossedCollections(join.joined);
      if (join !== undefined && crossed !== undefined) {
        context.report(
          suggestible(
            { node: join.node, messageId: join.orm, data: crossed },
            joinStrategyFix(context, checked, { join, call }) ?? {
              messageId: 'separate',
              plan: undefined,
            },
          ),
        );
      }
    }

    return {
      CallExpression(node) {
        if (isQueryBuilder(types, node)) {
          report(builderJoins(context, types, node), node);
          return;
        }
        report(findJoins(context, types, node), node);
        for (const join of includeJoins(context, types, node)) {
          report(join, node);
        }
      },
    };
  },
};
