import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import { findVariable } from '../analysis/constant-resolution.mts';
import { enclosingLoop, isIterationCall, type EnclosingLoop } from '../loops/loop-shapes.mts';
import { typeServices, type Context } from '../security/security-values.mts';
import { nameOf } from '../typed/node-views.mts';
import {
  helperRelation,
  isFetched,
  lazyBinding,
  lazyRelation,
  originQuery,
} from './lazy-relations.mts';
import type { Relation } from './relations/typeorm-schema.mts';

type Services = ParserServicesWithTypeInformation;
type LoopItem = {
  readonly declared: TSESTree.Node | undefined;
  readonly iterable: TSESTree.Node;
  readonly loop: TSESTree.Node;
};
type Found = { readonly item: LoopItem; readonly relation: Relation };
type Finding = Relation & { readonly origin: string };

const THEN_STEPS = new Set(['then', 'catch', 'finally']);

function loopItem(found: EnclosingLoop): LoopItem | undefined {
  if (found.loop?.type === AST_NODE_TYPES.ForOfStatement) {
    const { left, right } = found.loop;
    const declared =
      left.type === AST_NODE_TYPES.VariableDeclaration ? left.declarations[0].id : left;
    return { declared, iterable: right, loop: found.loop };
  }
  const { callback } = found;
  if (callback === undefined) {
    return undefined;
  }
  const call = callback.parent;
  const callee = call.type === AST_NODE_TYPES.CallExpression ? call.callee : undefined;
  return callee?.type === AST_NODE_TYPES.MemberExpression
    ? { declared: callback.params[0], iterable: callee.object, loop: callback }
    : undefined;
}

function iteratedItem(context: Context, identifier: TSESTree.Node): LoopItem | undefined {
  if (identifier.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const found = enclosingLoop(identifier, context);
  const item = found === undefined ? undefined : loopItem(found);
  const binding = findVariable(context, identifier, identifier.name)?.defs[0]?.name;
  return item !== undefined && binding === item.declared ? item : undefined;
}

function passedItem(
  context: Context,
  call: TSESTree.CallExpression,
):
  | { readonly item: LoopItem; readonly reference: TSESTree.Node; readonly index: number }
  | undefined {
  const [reference] = call.arguments;
  if (
    isIterationCall(call) &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    (reference?.type === AST_NODE_TYPES.Identifier ||
      reference?.type === AST_NODE_TYPES.MemberExpression)
  ) {
    return {
      item: { declared: undefined, iterable: call.callee.object, loop: call },
      reference,
      index: 0,
    };
  }
  const items = call.arguments.map((argument) => iteratedItem(context, argument));
  const index = items.findIndex((item) => item !== undefined);
  const item = items[index];
  return item === undefined ? undefined : { item, reference: call.callee, index };
}

function destructuredRelation(
  context: Context,
  services: Services,
  identifier: TSESTree.Identifier,
): Found | undefined {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const declarator = definition?.node;
  if (
    definition === undefined ||
    declarator?.type !== AST_NODE_TYPES.VariableDeclarator ||
    declarator.id.type !== AST_NODE_TYPES.ObjectPattern ||
    declarator.init === null
  ) {
    return undefined;
  }
  const source = declarator.init;
  const property = declarator.id.properties.find(
    (each): each is TSESTree.Property =>
      each.type === AST_NODE_TYPES.Property && !each.computed && each.value === definition.name,
  );
  const name = property === undefined ? undefined : nameOf(property.key);
  const item = name === undefined ? undefined : iteratedItem(context, source);
  const relation =
    item === undefined || name === undefined ? undefined : lazyBinding(services, source, name);
  return item === undefined || relation === undefined ? undefined : { item, relation };
}

function accessedRelation(
  context: Context,
  services: Services,
  member: TSESTree.Node,
): Found | undefined {
  const item =
    member.type === AST_NODE_TYPES.MemberExpression && !member.computed
      ? iteratedItem(context, member.object)
      : undefined;
  const relation = item === undefined ? undefined : lazyRelation(services, member);
  if (item !== undefined && relation !== undefined) {
    return { item, relation };
  }
  return member.type === AST_NODE_TYPES.Identifier
    ? destructuredRelation(context, services, member)
    : undefined;
}

function relationFinding(
  context: Context,
  services: Services,
  member: TSESTree.Node,
): Finding | undefined {
  const found = accessedRelation(context, services, member);
  if (found === undefined) {
    return undefined;
  }
  const origin = originQuery(context, services, found.item);
  return origin !== undefined && !isFetched(origin, found.relation.relation)
    ? { ...found.relation, origin: origin.label }
    : undefined;
}

function thenedAccess(call: TSESTree.CallExpression): TSESTree.Node | undefined {
  const { callee } = call;
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    THEN_STEPS.has(nameOf(callee.property) ?? '')
    ? callee.object
    : undefined;
}

function helperFinding(
  context: Context,
  services: Services,
  call: TSESTree.CallExpression,
): (Finding & { readonly access: string; readonly helper: string }) | undefined {
  const passed = passedItem(context, call);
  const origin = passed === undefined ? undefined : originQuery(context, services, passed.item);
  const relation =
    passed === undefined || origin === undefined
      ? undefined
      : helperRelation(services, passed.reference, passed.index);
  return passed !== undefined &&
    origin !== undefined &&
    relation !== undefined &&
    !isFetched(origin, relation.relation)
    ? { ...relation, origin: origin.label, helper: context.sourceCode.getText(passed.reference) }
    : undefined;
}

export const rule: TSESLint.RuleModule<
  'lazy' | 'lazyHelper',
  [],
  { readonly requiresTypeChecking: boolean }
> = {
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
        if (thened !== undefined && access?.type === AST_NODE_TYPES.MemberExpression) {
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
