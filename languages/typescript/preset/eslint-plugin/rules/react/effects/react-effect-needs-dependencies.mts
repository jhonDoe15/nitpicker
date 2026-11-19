import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { hookName, isFunctionNode } from '../react-effects.mts';

type Definition = TSESLint.Scope.Definition;
const { DefinitionType } = TSESLint.Scope;

const effectHooks = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
const stateHooks = new Set(['useState', 'useReducer']);
const guardKinds = new Set<string>([
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.LogicalExpression,
]);
const setterProp = /^set[A-Z]/u;

function isStateHookResult(sourceCode: SourceCode, definition: Definition): boolean {
  if (definition.type !== DefinitionType.Variable) {
    return false;
  }
  const { id, init } = definition.node;
  if (id.type !== AST_NODE_TYPES.ArrayPattern || init?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const hook = hookName(sourceCode, init.callee);
  return hook !== undefined && stateHooks.has(hook) && id.elements[1] === definition.name;
}

function isHookResultSetter(sourceCode: SourceCode, definition: Definition): boolean {
  if (
    definition.type !== DefinitionType.Variable ||
    !setterProp.test(nameOf(definition.name) ?? '')
  ) {
    return false;
  }
  const { id, init } = definition.node;
  return (
    (id.type === AST_NODE_TYPES.ObjectPattern || id.type === AST_NODE_TYPES.ArrayPattern) &&
    init?.type === AST_NODE_TYPES.CallExpression &&
    /^use[A-Z]/u.test(hookName(sourceCode, init.callee) ?? nameOf(init.callee) ?? '')
  );
}

function isSetterParameter(sourceCode: SourceCode, definition: Definition): boolean {
  if (!setterProp.test(nameOf(definition.name) ?? '')) {
    return false;
  }
  if (definition.type === DefinitionType.Parameter) {
    return true;
  }
  const init = definition.type === DefinitionType.Variable ? definition.node.init : undefined;
  return (
    definition.type === DefinitionType.Variable &&
    definition.node.id.type === AST_NODE_TYPES.ObjectPattern &&
    init?.type === AST_NODE_TYPES.Identifier &&
    (variableNamed(sourceCode, init)?.defs.some(({ type }) => type === DefinitionType.Parameter) ??
      false)
  );
}

function setterName(sourceCode: SourceCode, callee: TSESTree.Node): string | undefined {
  if (callee.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const definitions = variableNamed(sourceCode, callee)?.defs ?? [];
  return definitions.some(
    (definition) =>
      isStateHookResult(sourceCode, definition) ||
      isSetterParameter(sourceCode, definition) ||
      isHookResultSetter(sourceCode, definition),
  )
    ? callee.name
    : undefined;
}

function effectWithoutDependencies(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): TSESTree.Node | undefined {
  const hook = hookName(sourceCode, call.callee);
  const [callback] = call.arguments;
  return hook !== undefined &&
    effectHooks.has(hook) &&
    call.arguments.length === 1 &&
    callback !== undefined &&
    isFunctionNode(callback) &&
    !callback.async
    ? callback
    : undefined;
}

function isGuarded(node: TSESTree.Node, enclosing: TSESTree.Node): boolean {
  const chain = ancestorsOf(node);
  return chain.slice(0, chain.indexOf(enclosing)).some(({ type }) => guardKinds.has(type));
}

function measuresRef(sourceCode: SourceCode, effect: TSESTree.CallExpression): boolean {
  return (
    hookName(sourceCode, effect.callee) === 'useLayoutEffect' &&
    sourceCode.getText(effect).includes('.current')
  );
}

export const rule: TSESLint.RuleModule<'noDependencies'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow an effect without a dependency array that sets state' },
    schema: [],
    messages: {
      noDependencies:
        'This effect has no dependency array, so it runs after every render, and it calls ' +
        '`{{name}}`, which renders again. List what the effect reads (`}, [filter]);`), or `[]` to ' +
        'run once.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const effects = new Map<TSESTree.Node, TSESTree.CallExpression>();
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const callback = effectWithoutDependencies(sourceCode, node);
        if (callback !== undefined) {
          effects.set(callback, node);
          return;
        }
        const name = setterName(sourceCode, node.callee);
        const enclosing = name === undefined ? undefined : ancestorsOf(node).find(isFunctionNode);
        const effect = enclosing === undefined ? undefined : effects.get(enclosing);
        if (name !== undefined && enclosing !== undefined && effect !== undefined) {
          effects.delete(enclosing);
          if (isGuarded(node, enclosing) || measuresRef(sourceCode, effect)) {
            return;
          }
          context.report({ node: effect, messageId: 'noDependencies', data: { name } });
        }
      },
    };
  },
};
