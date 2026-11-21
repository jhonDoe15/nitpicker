import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import {
  enclosingFunction,
  hookName,
  nodesOutsideNestedFunctions,
  type FunctionNode,
} from '../react-effects.mts';
import { packageDependsOn, projectSourceMatches } from '../support/package-facts.mts';
import { freshPromise, type Lookup } from './fresh-promises.mts';

const { DefinitionType } = TSESLint.Scope;
const SERVER_COMPONENT_PACKAGES = [
  'next',
  'waku',
  'rwsdk',
  'vinext',
  'gatsby',
  'expo-router',
  '@react-router/dev',
  '@tanstack/react-start',
  '@lazarv/react-server',
  '@vitejs/plugin-rsc',
  '@parcel/rsc',
  'react-server-dom-webpack',
  'react-server-dom-turbopack',
  'react-server-dom-parcel',
  'react-server-dom-esm',
];
const CLIENT_DIRECTIVE = /^\s*(?:'use client'|"use client")/mu;
const CLIENT_HOOKS = new Set<string | undefined>([
  'useState',
  'useReducer',
  'useEffect',
  'useLayoutEffect',
  'useInsertionEffect',
  'useRef',
  'useContext',
  'useSyncExternalStore',
  'useTransition',
  'useDeferredValue',
  'useOptimistic',
  'useActionState',
  'useImperativeHandle',
]);

function isReactUse(sourceCode: SourceCode, callee: TSESTree.Node): boolean {
  const isImported =
    callee.type !== AST_NODE_TYPES.Identifier ||
    (variableNamed(sourceCode, callee)?.defs.length ?? 0) > 0;
  return isImported && hookName(sourceCode, callee) === 'use';
}

function hasClientDirective(sourceCode: SourceCode): boolean {
  return sourceCode.ast.body.some(
    (statement) =>
      statement.type === AST_NODE_TYPES.ExpressionStatement && statement.directive === 'use client',
  );
}

function callsClientHook(sourceCode: SourceCode, fn: FunctionNode): boolean {
  return nodesOutsideNestedFunctions(fn.body).some(
    (node) =>
      node.type === AST_NODE_TYPES.CallExpression &&
      CLIENT_HOOKS.has(hookName(sourceCode, node.callee)),
  );
}

function rendersOnClient({ sourceCode, filename }: Lookup, fn: FunctionNode): boolean {
  if (hasClientDirective(sourceCode) || callsClientHook(sourceCode, fn)) {
    return true;
  }
  return !(
    packageDependsOn(filename, SERVER_COMPONENT_PACKAGES) ||
    projectSourceMatches(filename, CLIENT_DIRECTIVE)
  );
}

function renderConstant(
  sourceCode: SourceCode,
  argument: TSESTree.Node,
  fn: FunctionNode,
): TSESTree.Node {
  const definition =
    argument.type === AST_NODE_TYPES.Identifier
      ? variableNamed(sourceCode, argument)?.defs.at(0)
      : undefined;
  const init =
    definition?.type === DefinitionType.Variable &&
    definition.parent.kind === 'const' &&
    enclosingFunction(definition.node) === fn
      ? definition.node.init
      : undefined;
  return init ?? argument;
}

export const rule: TSESLint.RuleModule<'uncached'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow passing `use` a promise created during the same render' },
    schema: [],
    messages: {
      uncached:
        '{{source}} a new promise on every render, so `use` suspends again each time one settles: ' +
        'the component never finishes rendering or repeats the request. Create the promise ' +
        'outside render: pass it in as a prop (from a parent, a loader or a Server Component), ' +
        'wrap the function in `cache`, or read it through a data library.',
    },
  },
  create(context) {
    const lookup: Lookup = { sourceCode: context.sourceCode, filename: context.filename };
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const [argument] = node.arguments;
        const fn = enclosingFunction(node);
        if (
          argument === undefined ||
          fn === undefined ||
          fn.async ||
          !isReactUse(lookup.sourceCode, node.callee)
        ) {
          return;
        }
        const source = freshPromise(lookup, renderConstant(lookup.sourceCode, argument, fn));
        if (source !== undefined && rendersOnClient(lookup, fn)) {
          context.report({ node, messageId: 'uncached', data: { source } });
        }
      },
    };
  },
};
