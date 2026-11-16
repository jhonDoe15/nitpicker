import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, nodeChildren, variableNamed, type SourceCode } from '../typed/node-views.mts';
import {
  enclosingFunction,
  hookName,
  isEffectCallback,
  type EffectCallback,
  type FunctionNode,
} from './react-effects.mts';

type MessageIds = 'derivedState' | 'resetState' | 'storageState';
type OptionalNode = TSESTree.Node | undefined;

const SETTER_INDEX = 1;
const storageNames = new Set<string | undefined>(['localStorage', 'sessionStorage']);
const globalObjects = new Set(['window', 'globalThis', 'self']);

function runsOnce(effectCall: TSESTree.CallExpression): boolean {
  const dependencies = effectCall.arguments[1];
  return (
    dependencies?.type === AST_NODE_TYPES.ArrayExpression && dependencies.elements.length === 0
  );
}

function declaredName(fn: FunctionNode): TSESTree.Identifier | undefined {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return fn.id ?? undefined;
  }
  const declarator = fn.parent;
  return declarator.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.init === fn &&
    declarator.id.type === AST_NODE_TYPES.Identifier
    ? declarator.id
    : undefined;
}

function isUseStateCall(sourceCode: SourceCode, node: OptionalNode): boolean {
  return (
    node?.type === AST_NODE_TYPES.CallExpression && hookName(sourceCode, node.callee) === 'useState'
  );
}

function isStateTuple(sourceCode: SourceCode, identifier: TSESTree.Identifier): boolean {
  return (
    variableNamed(sourceCode, identifier)?.defs.some(
      ({ node }) =>
        node.type === AST_NODE_TYPES.VariableDeclarator &&
        isUseStateCall(sourceCode, node.init ?? undefined),
    ) ?? false
  );
}

function isSetterIndexAccess(sourceCode: SourceCode, init: OptionalNode): boolean {
  return (
    init?.type === AST_NODE_TYPES.MemberExpression &&
    init.computed &&
    init.property.type === AST_NODE_TYPES.Literal &&
    init.property.value === SETTER_INDEX &&
    init.object.type === AST_NODE_TYPES.Identifier &&
    isStateTuple(sourceCode, init.object)
  );
}

function isStateSetterDefinition(
  sourceCode: SourceCode,
  definition: TSESLint.Scope.Definition,
): boolean {
  const declarator = definition.node;
  if (declarator.type !== AST_NODE_TYPES.VariableDeclarator) {
    return false;
  }
  if (declarator.id.type === AST_NODE_TYPES.ArrayPattern) {
    return (
      declarator.id.elements[SETTER_INDEX] === definition.name &&
      isUseStateCall(sourceCode, declarator.init ?? undefined)
    );
  }
  return isSetterIndexAccess(sourceCode, declarator.init ?? undefined);
}

function isStateSetterCall(sourceCode: SourceCode, node: TSESTree.CallExpression): boolean {
  return (
    node.callee.type === AST_NODE_TYPES.Identifier &&
    (variableNamed(sourceCode, node.callee)?.defs.some((definition) =>
      isStateSetterDefinition(sourceCode, definition),
    ) ??
      false)
  );
}

function isCalledSynchronouslyIn(
  sourceCode: SourceCode,
  fn: FunctionNode,
  effect: FunctionNode,
): boolean {
  const name = declaredName(fn);
  const variable = name === undefined ? undefined : variableNamed(sourceCode, name);
  return (
    variable?.references.some(
      ({ identifier }) =>
        identifier.parent.type === AST_NODE_TYPES.CallExpression &&
        identifier.parent.callee === identifier &&
        enclosingFunction(identifier.parent) === effect,
    ) ?? false
  );
}

function owningEffect(sourceCode: SourceCode, fn: FunctionNode): EffectCallback | undefined {
  if (isEffectCallback(sourceCode, fn)) {
    return fn;
  }
  const outer = fn.async || fn.generator ? undefined : enclosingFunction(fn);
  return outer !== undefined &&
    isEffectCallback(sourceCode, outer) &&
    isCalledSynchronouslyIn(sourceCode, fn, outer)
    ? outer
    : undefined;
}

function isFixedValue(node: OptionalNode): boolean {
  if (node === undefined) {
    return false;
  }
  if (node.type === AST_NODE_TYPES.Literal) {
    return true;
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.expressions.length === 0;
  }
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    return node.elements.length === 0;
  }
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return node.properties.length === 0;
  }
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name === 'undefined';
  }
  return (
    node.type === AST_NODE_TYPES.UnaryExpression && node.argument.type === AST_NODE_TYPES.Literal
  );
}

function isStorage(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return storageNames.has(node.name) && (variableNamed(sourceCode, node)?.defs.length ?? 0) === 0;
  }
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    storageNames.has(nameOf(node.property)) &&
    node.object.type === AST_NODE_TYPES.Identifier &&
    globalObjects.has(node.object.name)
  );
}

function readsStorage(sourceCode: SourceCode, root: TSESTree.Node | undefined): boolean {
  const pending = root === undefined ? [] : [root];
  for (const node of pending) {
    if (isStorage(sourceCode, node)) {
      return true;
    }
    pending.push(...nodeChildren(node));
  }
  return false;
}

function messageIdFor(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  effectCall: TSESTree.CallExpression,
): MessageIds {
  const [value] = call.arguments;
  if (readsStorage(sourceCode, value)) {
    return 'storageState';
  }
  const hasDependencyList = effectCall.arguments[1]?.type === AST_NODE_TYPES.ArrayExpression;
  return hasDependencyList && isFixedValue(value) ? 'resetState' : 'derivedState';
}

export const rule: TSESLint.RuleModule<MessageIds> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow setting state from an effect body, which derives state from props or state',
    },
    schema: [],
    messages: {
      derivedState:
        'Do not set state from an effect to mirror props or state. Compute the value during render (`const total = price * quantity;`). An exception fits only when this effect synchronizes with an external system.',
      resetState:
        'Do not reset state from an effect when a prop changes: render the component with that prop as its `key` (`<Form key={userId} />`), so React starts it with fresh state. An exception fits only when this effect synchronizes with an external system.',
      storageState:
        'Do not copy browser storage into state from an effect: read it during render with `useSyncExternalStore(subscribe, () => localStorage.getItem(key))`, which also follows changes from other tabs. An exception fits only when this effect synchronizes with an external system.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (!isStateSetterCall(sourceCode, node)) {
          return;
        }
        const fn = enclosingFunction(node);
        const effect = fn === undefined ? undefined : owningEffect(sourceCode, fn);
        if (effect !== undefined && !runsOnce(effect.parent)) {
          context.report({ node, messageId: messageIdFor(sourceCode, node, effect.parent) });
        }
      },
    };
  },
};
