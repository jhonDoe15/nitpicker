import { findVariable } from '../analysis/constant-resolution.mjs';
import { enclosingLoop, isIterationCall } from '../loops/loop-shapes.mjs';
import { typeServices } from '../security/security-values.mjs';
import {
  helperRelation,
  isFetched,
  lazyBinding,
  lazyRelation,
  originQuery,
} from './lazy-relations.mjs';

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
  const found = enclosingLoop(identifier, context);
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

function destructuredRelation(context, services, identifier) {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const declarator = definition?.node;
  const pattern = declarator?.type === 'VariableDeclarator' ? declarator.id : undefined;
  const source = declarator?.init;
  const property =
    pattern?.type === 'ObjectPattern'
      ? pattern.properties.find(
          (each) => each.type === 'Property' && !each.computed && each.value === definition.name,
        )
      : undefined;
  const item = property === undefined ? undefined : iteratedItem(context, source);
  const relation =
    item === undefined ? undefined : lazyBinding(services, source, property.key.name);
  return item === undefined || relation === undefined ? undefined : { item, relation };
}

function accessedRelation(context, services, member) {
  const isAccess = member.type === MEMBER && !member.computed;
  const item = isAccess ? iteratedItem(context, member.object) : undefined;
  const relation = item === undefined ? undefined : lazyRelation(services, member);
  if (item !== undefined && relation !== undefined) {
    return { item, relation };
  }
  return member.type === 'Identifier' ? destructuredRelation(context, services, member) : undefined;
}

function relationFinding(context, services, member) {
  const found = accessedRelation(context, services, member);
  const origin = found === undefined ? undefined : originQuery(context, services, found.item);
  return origin !== undefined && !isFetched(origin, found.relation.relation)
    ? { ...found.relation, origin: origin.label }
    : undefined;
}

function thenedAccess(call) {
  const { callee } = call;
  const steps = new Set(['then', 'catch', 'finally']);
  const isStep = callee.type === MEMBER && !callee.computed && steps.has(callee.property.name);
  return isStep ? callee.object : undefined;
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
        const access = thenedAccess(node);
        const thened =
          access === undefined ? undefined : relationFinding(context, services, access);
        if (thened !== undefined && access.type === MEMBER) {
          context.report({ node, messageId: 'lazy', data: thened });
        }
      },
      AwaitExpression(node) {
        const finding = relationFinding(context, services, node.argument);
        if (finding !== undefined) {
          context.report({ node, messageId: 'lazy', data: finding });
        }
      },
    };
  },
};
