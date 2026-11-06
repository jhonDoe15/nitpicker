import { findVariable } from '../analysis/constant-resolution.mjs';
import { enclosingLoop, isIterationCall } from '../loops/loop-shapes.mjs';
import { typeServices } from '../security/security-values.mjs';
import { helperRelation, isFetched, lazyRelation, originQuery } from './lazy-relations.mjs';

const MEMBER = 'MemberExpression';
const REFERENCES = new Set(['Identifier', MEMBER]);

function loopItem(found) {
  if (found.loop?.type === 'ForOfStatement') {
    const { left, right } = found.loop;
    const declared = left.type === 'VariableDeclaration' ? left.declarations[0].id : left;
    return { declared, iterable: right, loop: found.loop };
  }
  const callee = found.callback?.parent.callee;
  return callee?.type === MEMBER
    ? { declared: found.callback.params[0], iterable: callee.object, loop: found.callback }
    : undefined;
}

function iteratedItem(context, identifier) {
  if (identifier.type !== 'Identifier') {
    return undefined;
  }
  const found = enclosingLoop(identifier, context.sourceCode);
  const item = found === undefined ? undefined : loopItem(found);
  const binding = findVariable(context, identifier, identifier.name)?.defs[0]?.name;
  return item !== undefined && binding === item.declared ? item : undefined;
}

function passedItem(context, call) {
  const [reference] = call.arguments;
  if (isIterationCall(call) && REFERENCES.has(reference?.type)) {
    return { item: { iterable: call.callee.object, loop: call }, reference, index: 0 };
  }
  const items = call.arguments.map((argument) => iteratedItem(context, argument));
  const index = items.findIndex((item) => item !== undefined);
  return index === -1 ? undefined : { item: items[index], reference: call.callee, index };
}

function helperFinding(context, services, call) {
  const passed = passedItem(context, call);
  const origin = passed && originQuery(context, services, passed.item);
  const relation = origin && helperRelation(services, passed.reference, passed.index);
  return relation && !isFetched(origin, relation.relation)
    ? { ...relation, origin: origin.label, helper: context.sourceCode.getText(passed.reference) }
    : undefined;
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
      lazyHelper: [
        '`{{helper}}` receives each item loaded by `{{origin}}` and awaits `{{access}}`,',
        'the lazy relation `{{entity}}.{{relation}}`: one more query per item. Fetch it in that query:',
        'name it in `relations` (`relations: { {{relation}}: true }`) or join it with `leftJoinAndSelect`.',
        'An exception fits only when the loop passes a few items at most.',
      ].join(' '),
    },
  },
  create(context) {
    const services = typeServices(context);
    if (services === undefined) {
      return {};
    }
    return {
      CallExpression(node) {
        const finding = helperFinding(context, services, node);
        if (finding !== undefined) {
          context.report({ node, messageId: 'lazyHelper', data: finding });
        }
      },
      AwaitExpression(node) {
        const member = node.argument;
        const isAccess = member.type === MEMBER && !member.computed;
        const item = isAccess ? iteratedItem(context, member.object) : undefined;
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
