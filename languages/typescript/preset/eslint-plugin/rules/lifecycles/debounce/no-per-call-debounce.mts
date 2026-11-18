import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf, type SourceCode } from '../../typed/node-views.mts';
import { functionName, isFunctionNode, type FunctionNode } from '../scope/close-scopes.mts';
import { isOneTimeName } from '../shared/per-item.mts';
import {
  calleeProperty,
  enclosingMethod,
  hookCallbackOf,
  isConstructorFunction,
  nearestFunction,
  reactComponent,
} from '../shared/scopes.mts';
import { debounceName } from './debounce-calls.mts';

const KEEPERS = new Set<string>([
  'useMemo',
  'useCallback',
  'useRef',
  'useState',
  'useEffect',
  'useLayoutEffect',
  'useImperativeHandle',
]);

function returned(call: TSESTree.CallExpression): boolean {
  const { parent } = call;
  return (
    parent.type === AST_NODE_TYPES.ReturnStatement ||
    (parent.type === AST_NODE_TYPES.ArrowFunctionExpression && parent.body === call)
  );
}

function keptByHook(call: TSESTree.CallExpression, component: FunctionNode): boolean {
  const { parent } = call;
  if (parent.type === AST_NODE_TYPES.CallExpression && KEEPERS.has(calleeProperty(parent) ?? '')) {
    return true;
  }
  const stored =
    parent.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.right === call &&
    parent.left.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(parent.left.property) === 'current';
  if (stored) {
    return true;
  }
  for (const ancestor of ancestorsOf(call)) {
    if (ancestor === component) {
      return false;
    }
    if (isFunctionNode(ancestor) && KEEPERS.has(hookCallbackOf(ancestor) ?? '')) {
      return true;
    }
  }
  return false;
}

function perCallInClass(call: TSESTree.CallExpression): boolean {
  const method = enclosingMethod(call);
  const name = method === undefined ? undefined : functionName(method);
  return (
    method !== undefined &&
    name !== undefined &&
    !isConstructorFunction(method) &&
    !isOneTimeName(name) &&
    call.parent.type === AST_NODE_TYPES.CallExpression &&
    call.parent.arguments.some((argument) => argument === call)
  );
}

function invokedLocally(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  const { parent } = call;
  const host = nearestFunction(call);
  const name = host === undefined ? undefined : functionName(host);
  if (
    parent.type !== AST_NODE_TYPES.VariableDeclarator ||
    (name !== undefined && isOneTimeName(name))
  ) {
    return false;
  }
  return sourceCode
    .getDeclaredVariables(parent)
    .flatMap((variable) => variable.references)
    .some((ref) => {
      const { parent: user } = ref.identifier;
      return (
        user?.type === AST_NODE_TYPES.CallExpression &&
        user.callee === ref.identifier &&
        nearestFunction(user) === host
      );
    });
}

function immediatelyInvoked(call: TSESTree.CallExpression): boolean {
  return call.parent.type === AST_NODE_TYPES.CallExpression && call.parent.callee === call;
}

export const rule: TSESLint.RuleModule<'perCall'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow creating a debounced or throttled function per call or per render, so that nothing is debounced',
    },
    schema: [],
    messages: {
      perCall:
        '{{name}}() creates a new {{name}}d function with its own timer on every call or render, so nothing is {{name}}d and each event still fires. Create it once (a class field, module scope, `useMemo` or `useRef`) and call that function. An exception fits only when the function runs once per instance.',
    },
  },
  create(context) {
    return {
      CallExpression(call: TSESTree.CallExpression) {
        const name = debounceName(context.sourceCode, call);
        const handler = nearestFunction(call);
        if (name === undefined || handler === undefined || returned(call)) {
          return;
        }
        const component = reactComponent(call);
        const perCall =
          immediatelyInvoked(call) ||
          (component === undefined
            ? perCallInClass(call) || invokedLocally(context.sourceCode, call)
            : !keptByHook(call, component));
        if (perCall) {
          context.report({ node: call, messageId: 'perCall', data: { name } });
        }
      },
    };
  },
};
