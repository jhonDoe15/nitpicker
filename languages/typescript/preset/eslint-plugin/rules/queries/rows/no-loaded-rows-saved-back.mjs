import { isQueryResult, queryScope } from '../query-calls.mjs';
import { hookStatus } from './entity-hooks.mjs';
import { isProjection, loadedRows } from './loaded-rows.mjs';
import { DELETE, UPDATE, writeShape } from './row-writes.mjs';

const EXCEPTION =
  'An exception fits only when the model has hooks, subscribers, a version column or a cascade that a bulk statement skips.';
const CLASS_FAMILIES = ['typeorm', 'sequelize', 'mikro-orm'];

function isHookFree(scope, status) {
  if (status === 'unknown') {
    return !CLASS_FAMILIES.some((family) => scope.families.has(family));
  }
  return status !== 'hooked';
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow loading query rows only to change or delete every one of them the same way, when one statement would do',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      [UPDATE]: `These rows are loaded only to be changed the same way and written back. Update them in one statement: update(criteria, values) (TypeORM), updateMany (Prisma), Model.update(values, { where }) (Sequelize), nativeUpdate (MikroORM), or update().set().where() (Drizzle). ${EXCEPTION}`,
      [DELETE]: `These rows are loaded only to be deleted. Delete them in one statement: delete(criteria) (TypeORM), deleteMany (Prisma), destroy({ where }) (Sequelize), nativeDelete (MikroORM), or delete().where() (Drizzle). ${EXCEPTION}`,
    },
  },
  create(context) {
    const scope = queryScope(context);
    return {
      AwaitExpression(node) {
        if (!isQueryResult(scope, node)) {
          return;
        }
        const rows = loadedRows(context, node);
        const query = node.argument.type === 'CallExpression' ? node.argument : undefined;
        const found =
          rows === undefined || query === undefined || isProjection(query)
            ? undefined
            : writeShape(context, rows, query);
        if (found !== undefined && isHookFree(scope, hookStatus(context, node))) {
          context.report({ node: found.node, messageId: found.shape });
        }
      },
    };
  },
};
