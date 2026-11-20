import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { isCallback, type FunctionNode } from '../../typed/syntax-views.mts';
import { constFunctionOf, enclosingFunction, hookName } from '../react-effects.mts';
import { usesReactCompiler } from '../support/package-facts.mts';
import { freshReturn, freshValue, plainExpression } from './fresh-values.mts';

type MessageId = 'recreatedSubscribe' | 'freshSnapshot';
type ImportBindingDefinition = TSESLint.Scope.Definitions.ImportBindingDefinition;
type Bound = { readonly fn: FunctionNode; readonly perRender: boolean };

const { DefinitionType } = TSESLint.Scope;
const HOOK = 'useSyncExternalStore';
const NEW_OBJECT = 'a new object from `new`';
const builtInClasses = new Set(['Map', 'Set', 'Date', 'Array', 'Object', 'URL', 'URLSearchParams']);
const SHIM_SOURCES = new Set<unknown>(['use-sync-external-store', 'use-sync-external-store/shim']);

function isShimHook(sourceCode: SourceCode, callee: TSESTree.Node): boolean {
  if (callee.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const definition = variableNamed(sourceCode, callee)?.defs.find(
    (each): each is ImportBindingDefinition => each.type === DefinitionType.ImportBinding,
  );
  return (
    definition?.parent.type === AST_NODE_TYPES.ImportDeclaration &&
    SHIM_SOURCES.has(definition.parent.source.value) &&
    definition.node.type === AST_NODE_TYPES.ImportSpecifier &&
    definition.node.imported.type === AST_NODE_TYPES.Identifier &&
    definition.node.imported.name === HOOK
  );
}

function boundFunction(sourceCode: SourceCode, node: TSESTree.Node | undefined): Bound | undefined {
  if (node === undefined) {
    return undefined;
  }
  const plain = plainExpression(node);
  if (isCallback(plain)) {
    return { fn: plain, perRender: true };
  }
  const variable =
    plain.type === AST_NODE_TYPES.Identifier ? variableNamed(sourceCode, plain) : undefined;
  const [definition, ...others] = variable?.defs ?? [];
  const fn =
    definition === undefined || others.length > 0 ? undefined : constFunctionOf(definition);
  return variable === undefined || fn === undefined
    ? undefined
    : { fn, perRender: variable.scope.variableScope.block === enclosingFunction(node) };
}

function isBuiltInNew(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.NewExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    builtInClasses.has(node.callee.name) &&
    (variableNamed(sourceCode, node.callee)?.defs.length ?? 0) === 0
  );
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a stable subscribe function and a cached snapshot for useSyncExternalStore',
    },
    schema: [],
    messages: {
      recreatedSubscribe:
        'This `subscribe` function is created again on every render, so `useSyncExternalStore` unsubscribes and subscribes again each time. Declare it outside the component, or wrap it in `useCallback` when it depends on props or state. An exception fits only when resubscribing on every render is intended.',
      freshSnapshot:
        'This snapshot function returns {{what}} on every call. `useSyncExternalStore` compares snapshots with `Object.is`, so a value that is never the same twice renders in a loop ("The result of getSnapshot should be cached"). Return a value the store keeps and replaces only when it changes.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    function reportSnapshot(node: TSESTree.Node | undefined): void {
      const snapshot = boundFunction(sourceCode, node);
      const what =
        snapshot === undefined
          ? undefined
          : freshReturn(snapshot.fn, (returned) => {
              const plain = plainExpression(returned);
              return isBuiltInNew(sourceCode, plain) ? NEW_OBJECT : freshValue(plain);
            });
      if (node !== undefined && what !== undefined) {
        context.report({ node, messageId: 'freshSnapshot', data: { what } });
      }
    }
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const isHook =
          hookName(sourceCode, node.callee) === HOOK || isShimHook(sourceCode, node.callee);
        if (!isHook) {
          return;
        }
        const [subscribe, getSnapshot, getServerSnapshot] = node.arguments;
        const bound = boundFunction(sourceCode, subscribe);
        if (
          subscribe !== undefined &&
          bound?.perRender === true &&
          bound.fn.params.length > 0 &&
          !usesReactCompiler(context.filename)
        ) {
          context.report({ node: subscribe, messageId: 'recreatedSubscribe' });
        }
        reportSnapshot(getSnapshot);
        reportSnapshot(getServerSnapshot);
      },
    };
  },
};
