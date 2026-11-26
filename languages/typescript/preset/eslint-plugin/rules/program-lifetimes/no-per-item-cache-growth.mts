import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../analysis/constant-resolution.mts';
import { ancestorsOf, contains, depthFirst, nameOf, nodeChildren } from '../typed/node-views.mts';
import { isFunction } from '../typed/syntax-views.mts';

type Cache = { readonly uses: readonly TSESTree.MemberExpression[]; readonly writes: number };
type Fields = Map<TSESTree.ClassBody, ReadonlyMap<string, TSESTree.MemberExpression[]>>;
type LoopNode = TSESTree.ForOfStatement | TSESTree.ForInStatement;

const MAPS = new Set(['Map', 'WeakMap']);
const SHRINKS = new Set(['delete', 'clear']);
const MODULE_SCOPES = new Set(['module', 'global']);

function isNewMap(node: TSESTree.Node | null | undefined): boolean {
  return (
    node?.type === AST_NODE_TYPES.NewExpression &&
    MAPS.has(nameOf(node.callee) ?? '') &&
    node.arguments.length === 0
  );
}

function memberUse(node: TSESTree.Node): TSESTree.MemberExpression | undefined {
  const { parent } = node;
  return parent?.type === AST_NODE_TYPES.MemberExpression && parent.object === node
    ? parent
    : undefined;
}

function moduleCache(context: SourceContext, node: TSESTree.Identifier): Cache | undefined {
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (
    variable === undefined ||
    !MODULE_SCOPES.has(variable.scope.type) ||
    definition?.node.type !== AST_NODE_TYPES.VariableDeclarator ||
    definition.node.parent.parent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    !isNewMap(definition.node.init)
  ) {
    return undefined;
  }
  const { id } = definition.node;
  const reads = variable.references.filter((reference) => reference.identifier !== id);
  return {
    uses: reads.flatMap((reference) => memberUse(reference.identifier) ?? []),
    writes: reads.filter(
      (reference) => reference.isWrite() || memberUse(reference.identifier) === undefined,
    ).length,
  };
}

function thisMembers(
  owner: TSESTree.ClassBody,
  fields: Fields,
): ReadonlyMap<string, TSESTree.MemberExpression[]> {
  const known = fields.get(owner);
  if (known !== undefined) {
    return known;
  }
  const byName = new Map<string, TSESTree.MemberExpression[]>();
  for (const node of depthFirst<TSESTree.Node>(owner, nodeChildren)) {
    const name =
      node.type === AST_NODE_TYPES.MemberExpression &&
      node.object.type === AST_NODE_TYPES.ThisExpression
        ? nameOf(node.property)
        : undefined;
    if (name !== undefined && node.type === AST_NODE_TYPES.MemberExpression) {
      const list = byName.get(name) ?? [];
      list.push(node);
      byName.set(name, list);
    }
  }
  fields.set(owner, byName);
  return byName;
}

function fieldCache(member: TSESTree.MemberExpression, fields: Fields): Cache | undefined {
  const name = nameOf(member.property);
  const owner = ancestorsOf(member).find(
    (ancestor): ancestor is TSESTree.ClassBody => ancestor.type === AST_NODE_TYPES.ClassBody,
  );
  const field = owner?.body.find(
    (element) => element.type === AST_NODE_TYPES.PropertyDefinition && nameOf(element.key) === name,
  );
  if (
    owner === undefined ||
    field?.type !== AST_NODE_TYPES.PropertyDefinition ||
    !isNewMap(field.value)
  ) {
    return undefined;
  }
  const accesses = thisMembers(owner, fields).get(name ?? '') ?? [];
  return {
    uses: accesses.flatMap((access) => memberUse(access) ?? []),
    writes: accesses.filter((access) => memberUse(access) === undefined).length,
  };
}

function cacheOf(context: SourceContext, target: TSESTree.Node, fields: Fields): Cache | undefined {
  if (target.type === AST_NODE_TYPES.Identifier) {
    return moduleCache(context, target);
  }
  return target.type === AST_NODE_TYPES.MemberExpression &&
    target.object.type === AST_NODE_TYPES.ThisExpression
    ? fieldCache(target, fields)
    : undefined;
}

function loopNames(loop: LoopNode): ReadonlySet<string> {
  const names = [...depthFirst<TSESTree.Node>(loop.left, nodeChildren)].flatMap((node) =>
    node.type === AST_NODE_TYPES.Identifier ? [node.name] : [],
  );
  return new Set(names);
}

function readsLoopItem(key: TSESTree.Node, names: ReadonlySet<string>): boolean {
  return [...depthFirst<TSESTree.Node>(key, nodeChildren)].some(
    (node) => node.type === AST_NODE_TYPES.Identifier && names.has(node.name),
  );
}

function enclosingLoop(node: TSESTree.Node): LoopNode | undefined {
  for (const ancestor of ancestorsOf(node)) {
    if (isFunction(ancestor)) {
      return undefined;
    }
    if (
      ancestor.type === AST_NODE_TYPES.ForOfStatement ||
      ancestor.type === AST_NODE_TYPES.ForInStatement
    ) {
      return ancestor;
    }
  }
  return undefined;
}

function grows(context: SourceContext, call: TSESTree.CallExpression, fields: Fields): boolean {
  const { callee } = call;
  const [key] = call.arguments;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    nameOf(callee.property) !== 'set' ||
    key === undefined
  ) {
    return false;
  }
  const loop = enclosingLoop(call);
  const cache = loop === undefined ? undefined : cacheOf(context, callee.object, fields);
  if (loop === undefined || cache === undefined || cache.writes > 0) {
    return false;
  }
  const keyText = context.sourceCode.getText(key);
  const readInSameItem = cache.uses.some((use) => {
    const read = use.parent;
    return (
      nameOf(use.property) === 'get' &&
      read.type === AST_NODE_TYPES.CallExpression &&
      read.range[0] > call.range[1] &&
      read.arguments[0] !== undefined &&
      context.sourceCode.getText(read.arguments[0]) === keyText
    );
  });
  return (
    loop.right.type !== AST_NODE_TYPES.ArrayExpression &&
    readsLoopItem(key, loopNames(loop)) &&
    readInSameItem &&
    cache.uses.every((use) => contains(loop.body, use) && !SHRINKS.has(nameOf(use.property) ?? ''))
  );
}

export const rule: TSESLint.RuleModule<'perItemCache'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow a long-lived map that gets one entry per loop item and never lets it go',
    },
    schema: [],
    messages: {
      perItemCache:
        'This adds one entry per loop item to a map that outlives the loop, reads it back only for the same item and never removes it, so memory grows with the number of items instead of staying at the size of one. It matters when the loop is long and the cached value is large. Keep the value in a local of the loop body, or delete the entry once the item is done.',
    },
  },
  create(context) {
    const fields: Fields = new Map();
    return {
      CallExpression(node) {
        if (grows(context, node, fields)) {
          context.report({ node, messageId: 'perItemCache' });
        }
      },
    };
  },
};
