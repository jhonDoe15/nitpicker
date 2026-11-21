import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { hookName } from '../react-effects.mts';

type Variable = TSESLint.Scope.Variable;
type StateHook = 'useState' | 'useReducer';
type PairSlot = {
  readonly hook: StateHook;
  readonly call: TSESTree.CallExpression;
  readonly declarator: TSESTree.VariableDeclarator;
  readonly index: number;
};
export type SetterPair = {
  readonly hook: StateHook;
  readonly call: TSESTree.CallExpression;
  readonly state: Variable | undefined;
};

const { DefinitionType } = TSESLint.Scope;
const STATE_INDEX = 0;
const SETTER_INDEX = 1;

function stateHookOf(sourceCode: SourceCode, call: TSESTree.CallExpression): StateHook | undefined {
  const name = hookName(sourceCode, call.callee);
  return name === 'useState' || name === 'useReducer' ? name : undefined;
}

function pairSlot(sourceCode: SourceCode, variable: Variable | undefined): PairSlot | undefined {
  const definition = variable?.defs.at(0);
  if (definition?.type !== DefinitionType.Variable) {
    return undefined;
  }
  const declarator = definition.node;
  const init = declarator.init === null ? undefined : unwrapped(declarator.init);
  if (
    declarator.id.type !== AST_NODE_TYPES.ArrayPattern ||
    init?.type !== AST_NODE_TYPES.CallExpression
  ) {
    return undefined;
  }
  const hook = stateHookOf(sourceCode, init);
  const index = declarator.id.elements.indexOf(definition.name);
  return hook === undefined || index === -1 ? undefined : { hook, call: init, declarator, index };
}

function stateVariable(sourceCode: SourceCode, slot: PairSlot): Variable | undefined {
  const element =
    slot.declarator.id.type === AST_NODE_TYPES.ArrayPattern
      ? slot.declarator.id.elements[STATE_INDEX]
      : undefined;
  return element?.type === AST_NODE_TYPES.Identifier
    ? variableNamed(sourceCode, element)
    : undefined;
}

export function setterPair(sourceCode: SourceCode, callee: TSESTree.Node): SetterPair | undefined {
  if (callee.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const slot = pairSlot(sourceCode, variableNamed(sourceCode, callee));
  return slot?.index === SETTER_INDEX
    ? { hook: slot.hook, call: slot.call, state: stateVariable(sourceCode, slot) }
    : undefined;
}
