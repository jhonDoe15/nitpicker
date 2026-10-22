import { findVariable } from '../analysis/constant-resolution.mjs';
import { enclosingLoop } from '../loops/loop-shapes.mjs';
import { typeServices } from '../security/security-values.mjs';
import { isFetched, lazyRelation, originQuery } from './lazy-relations.mjs';

function loopItem(found) {
  if (found.loop?.type === 'ForOfStatement') {
    const { left, right } = found.loop;
    const declared = left.type === 'VariableDeclaration' ? left.declarations[0].id : left;
    return { declared, iterable: right, loop: found.loop };
  }
  const callee = found.callback?.parent.callee;
  return callee?.type === 'MemberExpression'
    ? { declared: found.callback.params[0], iterable: callee.object, loop: found.callback }
    : undefined;
}

function iteratedItem(context, member) {
  const found =
    member.object.type === 'Identifier' ? enclosingLoop(member, context.sourceCode) : undefined;
  const item = found === undefined ? undefined : loopItem(found);
  const binding = findVariable(context, member.object, member.object.name)?.defs[0]?.name;
  return item !== undefined && binding === item.declared ? item : undefined;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Do not load a lazy relation once per item of a query result',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      lazy: [
        '`{{entity}}.{{relation}}` is a lazy relation: awaiting it for each item loaded by `{{origin}}`',
        'runs one more query per item. Fetch it in that query: name it in `relations`',
        '(`relations: { {{relation}}: true }`) or join it with `leftJoinAndSelect`.',
        'An exception fits only when the loop reads it for a few items at most.',
      ].join(' '),
    },
  },
  create(context) {
    const services = typeServices(context);
    if (services === undefined) {
      return {};
    }
    return {
      AwaitExpression(node) {
        const member = node.argument;
        const isAccess = member.type === 'MemberExpression' && !member.computed;
        const item = isAccess ? iteratedItem(context, member) : undefined;
        const relation = item === undefined ? undefined : lazyRelation(services, member);
        const origin = relation === undefined ? undefined : originQuery(context, services, item);
        if (origin !== undefined && !isFetched(origin, relation.relation)) {
          context.report({
            node,
            messageId: 'lazy',
            data: { ...relation, origin: origin.label },
          });
        }
      },
    };
  },
};
