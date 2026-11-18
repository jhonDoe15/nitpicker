import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  isFunctionNode,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { ancestorsOf, chainOf } from '../typed/node-views.mts';
import { constantArguments, constantList, usesDefaultLocale } from './constant-arguments.mts';
import { sharedType, type Call } from './construction-kinds.mts';

type FunctionNode =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;

const ONCE_HOSTS = new Set(['useMemo', 'useState', 'once', 'memoize', 'lazy']);
const KEEPING_OPERATORS = new Set(['??=', '||=']);
const ONCE_PLACES = new Set<string>([
  AST_NODE_TYPES.PropertyDefinition,
  AST_NODE_TYPES.StaticBlock,
]);
const SCHEMA_USES = new Set(['compile', 'validate', 'compileAsync', 'validateSchema']);

function runsOnce(fn: FunctionNode): boolean {
  const { parent } = fn;
  return (
    (parent.type === AST_NODE_TYPES.MethodDefinition && parent.kind === 'constructor') ||
    (parent.type === AST_NODE_TYPES.CallExpression &&
      parent.callee.type === AST_NODE_TYPES.Identifier &&
      ONCE_HOSTS.has(parent.callee.name) &&
      parent.arguments.some((argument) => argument === fn))
  );
}

function declaredOutside(context: SourceContext, target: TSESTree.Node, fn: FunctionNode): boolean {
  const variable =
    target.type === AST_NODE_TYPES.Identifier
      ? findVariable(context, target, target.name)
      : undefined;
  const declaration = variable?.defs.at(0)?.node;
  return declaration !== undefined && !ancestorsOf(declaration).includes(fn) && declaration !== fn;
}

function isStoreCall(node: TSESTree.Node, value: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.property.name === 'set' &&
    node.arguments.some((argument) => argument === value)
  );
}

function handedOut(node: TSESTree.Node, fn: FunctionNode): boolean {
  const value =
    chainOf<TSESTree.Node>(node, (link) =>
      link.parent?.type === AST_NODE_TYPES.Property && link.parent.value === link
        ? link.parent.parent
        : undefined,
    ).at(-1) ?? node;
  const { parent } = value;
  if (parent === undefined) {
    return false;
  }
  return (
    parent.type === AST_NODE_TYPES.ReturnStatement ||
    (parent === fn && fn.body === value) ||
    isStoreCall(parent, value)
  );
}

function inReturnedFunction(
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
  fn: FunctionNode,
): boolean {
  return ancestorsOf(identifier).some(
    (ancestor) => isFunctionNode(ancestor) && ancestor !== fn && handedOut(ancestor, fn),
  );
}

function escapes(context: SourceContext, target: TSESTree.Node, fn: FunctionNode): boolean {
  const variable =
    target.type === AST_NODE_TYPES.Identifier
      ? findVariable(context, target, target.name)
      : undefined;
  return (variable?.references ?? []).some(
    ({ identifier }) => handedOut(identifier, fn) || inReturnedFunction(identifier, fn),
  );
}

function kept(context: SourceContext, node: Call, fn: FunctionNode): boolean {
  const { parent } = node;
  if (handedOut(node, fn)) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.init === node) {
    return escapes(context, parent.id, fn);
  }
  if (parent.type === AST_NODE_TYPES.AssignmentExpression && parent.right === node) {
    return (
      KEEPING_OPERATORS.has(parent.operator) ||
      parent.left.type === AST_NODE_TYPES.MemberExpression ||
      declaredOutside(context, parent.left, fn) ||
      escapes(context, parent.left, fn)
    );
  }
  return false;
}

function isIife(fn: FunctionNode): boolean {
  return fn.parent.type === AST_NODE_TYPES.CallExpression && fn.parent.callee === fn;
}

function enclosingFunction(node: TSESTree.Node): FunctionNode | undefined {
  const place = ancestorsOf(node).find(
    (ancestor) => ONCE_PLACES.has(ancestor.type) || (isFunctionNode(ancestor) && !isIife(ancestor)),
  );
  return place !== undefined && isFunctionNode(place) ? place : undefined;
}

function inCatch(node: TSESTree.Node, fn: FunctionNode): boolean {
  const path = ancestorsOf(node);
  return path
    .slice(0, path.indexOf(fn))
    .some((ancestor) => ancestor.type === AST_NODE_TYPES.CatchClause);
}

function perCall(context: SourceContext, node: Call): boolean {
  const fn = enclosingFunction(node);
  return fn !== undefined && !runsOnce(fn) && !inCatch(node, fn) && !kept(context, node, fn);
}

function memberOf(node: TSESTree.Node): TSESTree.MemberExpression | undefined {
  const { parent } = node;
  return parent?.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === node &&
    !parent.computed &&
    parent.property.type === AST_NODE_TYPES.Identifier
    ? parent
    : undefined;
}

function usedThrough(context: SourceContext, node: Call): TSESTree.MemberExpression[] {
  const { parent } = node;
  const direct = memberOf(node);
  if (direct !== undefined) {
    return [direct];
  }
  if (
    parent.type !== AST_NODE_TYPES.VariableDeclarator ||
    parent.id.type !== AST_NODE_TYPES.Identifier
  ) {
    return [];
  }
  const references = findVariable(context, parent.id, parent.id.name)?.references ?? [];
  return references
    .filter(({ identifier }) => identifier !== parent.id)
    .map(({ identifier }) => memberOf(identifier))
    .filter((member) => member !== undefined);
}

function onlyReadsOptions(context: SourceContext, node: Call): boolean {
  const members = usedThrough(context, node);
  return (
    members.length > 0 &&
    members.every(
      (member) =>
        member.property.type === AST_NODE_TYPES.Identifier &&
        member.property.name === 'resolvedOptions',
    )
  );
}

function varyingSchema(context: SourceContext, node: Call): boolean {
  return usedThrough(context, node).some(({ parent, property }) => {
    const [schema] = parent.type === AST_NODE_TYPES.CallExpression ? parent.arguments : [];
    return (
      property.type === AST_NODE_TYPES.Identifier &&
      SCHEMA_USES.has(property.name) &&
      schema !== undefined &&
      !constantList(context, [schema])
    );
  });
}

function reportable(context: SourceContext, node: Call, type: string): boolean {
  const intl = type.startsWith('Intl.');
  return (
    constantArguments(context, node) &&
    !(intl && (usesDefaultLocale(context, node) || onlyReadsOptions(context, node))) &&
    perCall(context, node)
  );
}

export const rule: TSESLint.RuleModule<
  'perCall' | 'cacheValidator',
  readonly [],
  { readonly requiresTypeChecking: boolean }
> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow building an Intl formatter or an Ajv instance with fixed options on every call',
      requiresTypeChecking: false,
    },
    schema: [],
    messages: {
      perCall:
        'Build `{{ type }}` once and reuse it: with fixed options it is safe to share, and building it loads locale data or compiles schemas on every call. Keep it in a module-level constant or a class field, or cache it by the value that varies.',
      cacheValidator:
        'Do not share one `{{ type }}` here: the schema changes per call, so a shared instance would keep every schema it compiles forever and reject a repeated `$id`. Cache the compiled validator by the schema or its key, and build `{{ type }}` once next to that cache.',
    },
  },
  create(context) {
    function check(node: Call): void {
      const type = sharedType(context, node);
      if (type === undefined || !reportable(context, node, type)) {
        return;
      }
      context.report({
        node,
        messageId:
          type.startsWith('Intl.') || !varyingSchema(context, node) ? 'perCall' : 'cacheValidator',
        data: { type },
      });
    }
    return { NewExpression: check, CallExpression: check };
  },
};
