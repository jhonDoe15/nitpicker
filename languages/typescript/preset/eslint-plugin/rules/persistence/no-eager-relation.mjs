import { MIKRO_ORM } from './orm-bindings.mjs';
import { relationsAt } from './relation-shapes.mjs';
import { defaultScopeOf, eagerInclude } from './sequelize-scopes.mjs';

const EXCEPTION = 'An exception fits only for a small lookup relation that every read needs.';

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow relations mapped to load on every query (TypeORM and MikroORM eager, a Sequelize defaultScope include)',
    },
    schema: [],
    messages: {
      typeormEager: `eager: true makes TypeORM load this relation with every find of the entity, whether the caller needs it or not. Leave it out and load the relation on the queries that need it: relations: { customer: true } in that find, or leftJoinAndSelect in a query builder. ${EXCEPTION}`,
      mikroOrmEager: `eager makes MikroORM populate this relation on every load of the entity, whether the caller needs it or not. Leave it out and populate the relation on the queries that need it: em.find(Order, where, { populate: ['customer'] }). ${EXCEPTION}`,
      sequelizeDefaultScope: `An include in the defaultScope joins these associations into every query of the model, whether the caller needs them or not. Put the include in a named scope (Order.scope('withCustomer')) or pass include on the queries that need it. ${EXCEPTION}`,
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const reported = new Set();

    function report(node, messageId) {
      if (!reported.has(node)) {
        reported.add(node);
        context.report({ node, messageId });
      }
    }

    function reportRelations(node) {
      for (const relation of relationsAt(sourceCode, node)) {
        if (relation.eager !== undefined) {
          report(relation.eager, relation.orm === MIKRO_ORM ? 'mikroOrmEager' : 'typeormEager');
        }
      }
    }

    function reportDefaultScope(node) {
      const scope = defaultScopeOf(sourceCode, node);
      const include = scope === undefined ? undefined : eagerInclude(sourceCode, scope);
      if (include !== undefined) {
        report(include, 'sequelizeDefaultScope');
      }
    }

    return {
      CallExpression(node) {
        reportRelations(node);
        reportDefaultScope(node);
      },
      NewExpression: reportRelations,
      Property: reportDefaultScope,
    };
  },
};
