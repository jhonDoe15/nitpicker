import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import {
  enclosingFunction,
  nodesOutsideNestedFunctions,
  type FunctionNode,
} from '../react-effects.mts';
import {
  functionLabel,
  isComponentName,
  isHookName,
  isServerFile,
} from '../support/component-names.mts';

type MessageId = 'navigation' | 'listener' | 'title';
type Finding = { readonly messageId: MessageId; readonly node: TSESTree.Node };

const { DefinitionType } = TSESLint.Scope;
const JSX_TYPES = new Set<string>([AST_NODE_TYPES.JSXElement, AST_NODE_TYPES.JSXFragment]);
const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self']);
const ROUTER_HOOKS = new Set<string | undefined>(['useRouter', 'useHistory']);
const ROUTER_PACKAGES = new Set<unknown>([
  'react-router',
  'react-router-dom',
  'react-router-native',
  '@remix-run/react',
  '@tanstack/react-router',
  'next/navigation',
  'next/router',
  'next/compat/router',
  'expo-router',
]);
const ROUTER_METHODS = new Set<string | undefined>(['push', 'replace', 'back', 'navigate']);

function calledName(node: TSESTree.Node): string | undefined {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const callee = unwrapped(node.callee);
  return callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(callee.property) : nameOf(callee);
}

function routerHook(sourceCode: SourceCode, init: TSESTree.Expression): string | undefined {
  const callee = init.type === AST_NODE_TYPES.CallExpression ? init.callee : undefined;
  const definition =
    callee?.type === AST_NODE_TYPES.Identifier
      ? variableNamed(sourceCode, callee)?.defs.at(0)
      : undefined;
  const isRouterImport =
    definition?.type === DefinitionType.ImportBinding &&
    definition.parent.type === AST_NODE_TYPES.ImportDeclaration &&
    ROUTER_PACKAGES.has(definition.parent.source.value);
  return isRouterImport && definition.node.type === AST_NODE_TYPES.ImportSpecifier
    ? nameOf(definition.node.imported)
    : undefined;
}

function isRendered(node: TSESTree.Node, fn: FunctionNode): boolean {
  return (
    JSX_TYPES.has(node.type) &&
    (fn.body.type !== AST_NODE_TYPES.BlockStatement ||
      ancestorsOf(node).some((ancestor) => ancestor.type === AST_NODE_TYPES.ReturnStatement))
  );
}

function isRenderFunction(fn: FunctionNode, filename: string): boolean {
  const label = functionLabel(fn);
  if (fn.async || isServerFile(filename)) {
    return false;
  }
  if (isComponentName(label)) {
    return nodesOutsideNestedFunctions(fn.body).some((node) => isRendered(node, fn));
  }
  return (
    isHookName(label) &&
    nodesOutsideNestedFunctions(fn.body).some((node) => isHookName(calledName(node)))
  );
}

function hookResult(
  sourceCode: SourceCode,
  identifier: TSESTree.Node,
  fn: FunctionNode,
): string | undefined {
  const definition =
    identifier.type === AST_NODE_TYPES.Identifier
      ? variableNamed(sourceCode, identifier)?.defs.at(0)
      : undefined;
  if (definition?.type !== DefinitionType.Variable || enclosingFunction(definition.node) !== fn) {
    return undefined;
  }
  const { id, init } = definition.node;
  return id.type === AST_NODE_TYPES.Identifier && init !== null
    ? routerHook(sourceCode, init)
    : undefined;
}

function isPageDocument(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name === 'document' && (variableNamed(sourceCode, node)?.defs.length ?? 0) === 0;
  }
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    nameOf(node.property) === 'document' &&
    node.object.type === AST_NODE_TYPES.Identifier &&
    GLOBAL_OBJECTS.has(node.object.name) &&
    (variableNamed(sourceCode, node.object)?.defs.length ?? 0) === 0
  );
}

function onPageDocument(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const pending = [node];
  for (const current of pending) {
    if (isPageDocument(sourceCode, current)) {
      return true;
    }
    if (current.type === AST_NODE_TYPES.MemberExpression && !current.computed) {
      pending.push(current.object);
    }
  }
  return false;
}

function callEffect(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  fn: FunctionNode,
): MessageId | undefined {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return hookResult(sourceCode, callee, fn) === 'useNavigate' ? 'navigation' : undefined;
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return undefined;
  }
  const method = nameOf(callee.property);
  if (method === 'addEventListener') {
    return onPageDocument(sourceCode, callee.object) ? 'listener' : undefined;
  }
  return ROUTER_METHODS.has(method) && ROUTER_HOOKS.has(hookResult(sourceCode, callee.object, fn))
    ? 'navigation'
    : undefined;
}

function statementExpressions(expression: TSESTree.Expression): TSESTree.Expression[] {
  const pending = [expression];
  for (const current of pending) {
    if (current.type === AST_NODE_TYPES.LogicalExpression) {
      pending.push(current.right);
    } else if (current.type === AST_NODE_TYPES.ConditionalExpression) {
      pending.push(current.consequent, current.alternate);
    } else if (current.type === AST_NODE_TYPES.ChainExpression) {
      pending.push(current.expression);
    } else if (current.type === AST_NODE_TYPES.UnaryExpression && current.operator === 'void') {
      pending.push(current.argument);
    }
  }
  return pending;
}

function effectOf(
  sourceCode: SourceCode,
  expression: TSESTree.Expression,
  fn: FunctionNode,
): Finding | undefined {
  if (expression.type === AST_NODE_TYPES.CallExpression) {
    const messageId = callEffect(sourceCode, expression, fn);
    return messageId === undefined ? undefined : { messageId, node: expression };
  }
  const isTitle =
    expression.type === AST_NODE_TYPES.AssignmentExpression &&
    expression.left.type === AST_NODE_TYPES.MemberExpression &&
    !expression.left.computed &&
    nameOf(expression.left.property) === 'title' &&
    isPageDocument(sourceCode, expression.left.object);
  return isTitle ? { messageId: 'title', node: expression } : undefined;
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow navigation, document listeners and title writes while rendering',
    },
    schema: [],
    messages: {
      navigation:
        '`{{call}}` navigates while the component renders, which may run more than once, so the ' +
        'router ignores the call or repeats it. Navigate in the event handler or effect that ' +
        'causes it, or render a redirect (`<Navigate to="..." />`, `redirect()`).',
      listener:
        '`{{call}}` adds one more listener on every render and none is removed. Add it in ' +
        '`useEffect` and remove it in the cleanup, or read the value with `useSyncExternalStore`.',
      title:
        '`document.title` is assigned while the component renders, also for renders React ' +
        'throws away. Set it in `useEffect`, or render `<title>` (React 19).',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      ExpressionStatement(node: TSESTree.ExpressionStatement) {
        const fn = enclosingFunction(node);
        if (fn === undefined || !isRenderFunction(fn, context.filename)) {
          return;
        }
        const findings = statementExpressions(node.expression).flatMap(
          (expression) => effectOf(sourceCode, expression, fn) ?? [],
        );
        for (const finding of findings) {
          const call =
            'callee' in finding.node ? `${sourceCode.getText(finding.node.callee)}(...)` : '';
          context.report({ node: finding.node, messageId: finding.messageId, data: { call } });
        }
      },
    };
  },
};
