import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  isFunctionNode,
  resolveConstant,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { ancestorsOf, chainOf } from '../typed/node-views.mts';

type Call = TSESTree.NewExpression | TSESTree.CallExpression;
type FunctionNode =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;
type Part = TSESTree.Node | TSESTree.ArrayExpression['elements'][number] | undefined;

const { DefinitionType } = TSESLint.Scope;

const INTL_TYPES = new Set([
  'Collator',
  'DateTimeFormat',
  'DisplayNames',
  'DurationFormat',
  'ListFormat',
  'NumberFormat',
  'PluralRules',
  'RelativeTimeFormat',
  'Segmenter',
]);
const AJV_SOURCE = /^ajv(?:\/|$)/u;
const ONCE_HOSTS = new Set(['useMemo', 'useState', 'once', 'memoize', 'lazy']);
const KEEPING_OPERATORS = new Set(['??=', '||=']);
const ONCE_PLACES = new Set<string>([
  AST_NODE_TYPES.PropertyDefinition,
  AST_NODE_TYPES.StaticBlock,
]);
const MAX_PARTS = 50;

function globalName(context: SourceContext, node: TSESTree.Node, name: string): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier || node.name !== name) {
    return false;
  }
  const variable = findVariable(context, node, name);
  return variable === undefined || variable.defs.length === 0;
}

function intlType(context: SourceContext, callee: TSESTree.Node): string | undefined {
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    callee.property.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  const owner = callee.object;
  const intl =
    globalName(context, owner, 'Intl') ||
    (owner.type === AST_NODE_TYPES.MemberExpression &&
      !owner.computed &&
      globalName(context, owner.object, 'globalThis') &&
      owner.property.name === 'Intl');
  return intl && INTL_TYPES.has(callee.property.name) ? `Intl.${callee.property.name}` : undefined;
}

function ajvType(context: SourceContext, callee: TSESTree.Node): string | undefined {
  if (callee.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const definition = findVariable(context, callee, callee.name)?.defs.at(0);
  const source =
    definition?.type === DefinitionType.ImportBinding &&
    definition.parent.type === AST_NODE_TYPES.ImportDeclaration
      ? definition.parent.source.value
      : '';
  return AJV_SOURCE.test(source) ? callee.name : undefined;
}

function sharedType(context: SourceContext, node: Call): string | undefined {
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return intlType(context, node.callee) ?? ajvType(context, node.callee);
  }
  return intlType(context, node.callee);
}

function parts(node: TSESTree.Node): readonly Part[] {
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    return node.elements;
  }
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return node.properties.map((entry) =>
      entry.type === AST_NODE_TYPES.Property && !entry.computed ? entry.value : undefined,
    );
  }
  if (node.type === AST_NODE_TYPES.UnaryExpression) {
    return [node.argument];
  }
  return node.type === AST_NODE_TYPES.TemplateLiteral ? node.expressions : [];
}

function leafConstant(context: SourceContext, node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.Literal ||
    node.type === AST_NODE_TYPES.TemplateLiteral ||
    node.type === AST_NODE_TYPES.ArrayExpression ||
    node.type === AST_NODE_TYPES.ObjectExpression ||
    node.type === AST_NODE_TYPES.UnaryExpression ||
    globalName(context, node, 'undefined')
  );
}

function constantArguments(context: SourceContext, node: Call): boolean {
  const pending: Part[] = [...node.arguments];
  for (const current of pending) {
    const value =
      current === undefined || current === null ? undefined : resolveConstant(context, current);
    if (value === undefined || !leafConstant(context, value) || pending.length > MAX_PARTS) {
      return false;
    }
    pending.push(...parts(value));
  }
  return true;
}

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

function perCall(context: SourceContext, node: Call): boolean {
  const fn = enclosingFunction(node);
  return fn !== undefined && !runsOnce(fn) && !kept(context, node, fn);
}

export const rule: TSESLint.RuleModule<
  'perCall',
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
    },
  },
  create(context) {
    function check(node: Call): void {
      const type = sharedType(context, node);
      if (type !== undefined && constantArguments(context, node) && perCall(context, node)) {
        context.report({ node, messageId: 'perCall', data: { type } });
      }
    }
    return { NewExpression: check, CallExpression: check };
  },
};
