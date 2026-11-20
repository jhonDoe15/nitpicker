import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, variableNamed } from '../../typed/node-views.mts';
import { moduleValueOf, type FileContext } from '../support/bound-values.mts';
import {
  calleeBinding,
  type CalleeShape,
  DEFAULT_EXPORT,
  type ImportedName,
  type ModuleFacts,
  type ResolvedValue,
} from '../support/module-facts.mts';

export type StoreHook = 'redux' | 'zustand' | 'zustand-store';
type ImportBindingDefinition = TSESLint.Scope.Definitions.ImportBindingDefinition;

const REDUX_PACKAGE = 'react-redux';
const REDUX = 'redux';
const HOOK_NAME = /^use[A-Z]/u;
const ZUSTAND_SOURCES = new Set(['zustand', 'zustand/react']);
const ZUSTAND_FACTORIES = new Set(['create', DEFAULT_EXPORT]);

function packageHook({ source, name }: ImportedName): StoreHook | undefined {
  if (source === REDUX_PACKAGE && name === 'useSelector') {
    return REDUX;
  }
  return ZUSTAND_SOURCES.has(source) && name === 'useStore' ? 'zustand-store' : undefined;
}

function isTypedReduxHook(facts: ModuleFacts, callee: CalleeShape, argumentCount: number): boolean {
  if (callee.kind !== 'member' || callee.name !== 'withTypes' || argumentCount !== 0) {
    return false;
  }
  const binding = calleeBinding(facts, { kind: 'name', name: callee.owner });
  return binding !== undefined && packageHook(binding) === REDUX;
}

function isZustandFactory(facts: ModuleFacts, callee: CalleeShape): boolean {
  const binding = callee.kind === 'name' ? calleeBinding(facts, callee) : undefined;
  return (
    binding !== undefined &&
    ZUSTAND_SOURCES.has(binding.source) &&
    ZUSTAND_FACTORIES.has(binding.name)
  );
}

function isZustandHook(facts: ModuleFacts, callee: CalleeShape, argumentCount: number): boolean {
  if (argumentCount === 0) {
    return false;
  }
  return callee.kind === 'call'
    ? callee.argumentCount === 0 && isZustandFactory(facts, callee.callee)
    : isZustandFactory(facts, callee);
}

function hookOfValue(resolved: ResolvedValue | undefined): StoreHook | undefined {
  if (resolved === undefined) {
    return undefined;
  }
  if (resolved.kind === 'package') {
    return packageHook(resolved.binding);
  }
  const { facts, shape } = resolved;
  if (shape.kind !== 'call') {
    return undefined;
  }
  if (isTypedReduxHook(facts, shape.callee, shape.argumentCount)) {
    return REDUX;
  }
  return isZustandHook(facts, shape.callee, shape.argumentCount) ? 'zustand' : undefined;
}

function importedHook(definition: ImportBindingDefinition): StoreHook | undefined {
  const declaration = definition.parent;
  if (
    declaration.type !== AST_NODE_TYPES.ImportDeclaration ||
    definition.node.type !== AST_NODE_TYPES.ImportSpecifier
  ) {
    return undefined;
  }
  const name = nameOf(definition.node.imported);
  return name === undefined ? undefined : packageHook({ source: declaration.source.value, name });
}

export function storeHookOf(
  context: FileContext,
  callee: TSESTree.Identifier,
): StoreHook | undefined {
  if (!HOOK_NAME.test(callee.name)) {
    return undefined;
  }
  const definition = variableNamed(context.sourceCode, callee)?.defs.at(0);
  const direct =
    definition?.type === TSESLint.Scope.DefinitionType.ImportBinding
      ? importedHook(definition)
      : undefined;
  return direct ?? hookOfValue(moduleValueOf(context, callee));
}
