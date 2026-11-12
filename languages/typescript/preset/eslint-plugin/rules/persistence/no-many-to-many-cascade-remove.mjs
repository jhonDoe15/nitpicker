import { MIKRO_ORM, TYPEORM } from './orm-bindings.mjs';
import { MANY_TO_MANY, cascadeName, relationsAt } from './relation-shapes.mjs';

const REMOVING = new Map([
  [TYPEORM, new Set(['true', 'remove', 'soft-remove'])],
  [MIKRO_ORM, new Set(['all', 'remove'])],
]);

function removes(sourceCode, relation) {
  const removing = REMOVING.get(relation.orm);
  return relation.cascade.values.some((value) => removing.has(cascadeName(sourceCode, value)));
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow cascading removes on many-to-many relations (TypeORM and MikroORM)',
    },
    schema: [],
    messages: {
      typeormCascade:
        "A cascade that removes (cascade: true, 'remove' or 'soft-remove') on a many-to-many relation removes the related rows when one owner is removed, although other owners still share them. Cascade only ['insert', 'update']; removing the owner already deletes its join rows (the join table's onDelete: 'CASCADE', the default).",
      mikroOrmCascade:
        'Cascade.ALL or Cascade.REMOVE on a many-to-many relation removes the related rows when one owner is removed, although other owners still share them. Cascade only [Cascade.PERSIST]; removing the owner already deletes its pivot rows.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const reported = new Set();

    function report(node) {
      for (const relation of relationsAt(sourceCode, node)) {
        if (
          relation.kind === MANY_TO_MANY &&
          relation.cascade !== undefined &&
          !reported.has(relation.cascade.node) &&
          removes(sourceCode, relation)
        ) {
          reported.add(relation.cascade.node);
          context.report({
            node: relation.cascade.node,
            messageId: relation.orm === MIKRO_ORM ? 'mikroOrmCascade' : 'typeormCascade',
          });
        }
      }
    }

    return { CallExpression: report, NewExpression: report };
  },
};
