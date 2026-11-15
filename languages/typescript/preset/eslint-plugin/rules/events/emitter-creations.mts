import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { resolveConstant, stringValue } from '../analysis/constant-resolution.mts';
import {
  bindingsOf,
  importedFunction,
  isModuleValue,
  type ModuleBindings,
} from '../security/imported-names.mts';
import { memberName, typeServices, unwrapped, type Context } from '../security/security-values.mts';
import { chainOf } from '../typed/node-views.mts';
import {
  EMITTER_SOURCES,
  type EmitterSource,
  isChainableMethod,
  isEmitterType,
  isListenMethod,
} from './emitter-modules.mts';

const TYPESCRIPT_FILE = /\.[cm]?tsx?$/u;
const MODULE_PATH = /\/node_modules\/(?:@types\/)?((?:@[^/]+\/)?[^/]+)\//gu;
const MAX_BASES = 32;

type CallLike = TSESTree.CallExpression | TSESTree.NewExpression;
type SourceField = 'factories' | 'constructors' | 'servers';
type Bindings = (modules: ReadonlySet<string>) => ModuleBindings;
export type EmitterScope = { readonly context: Context; readonly bindingsFor: Bindings };
export type MemberCall = TSESTree.CallExpression & { readonly callee: TSESTree.MemberExpression };

export function isMemberCall(call: TSESTree.CallExpression): call is MemberCall {
  return call.callee.type === AST_NODE_TYPES.MemberExpression;
}

export function createBindings(program: TSESTree.Program): Bindings {
  const cache = new Map<ReadonlySet<string>, ModuleBindings>();
  return (modules) => {
    const cached = cache.get(modules) ?? bindingsOf(program, modules);
    cache.set(modules, cached);
    return cached;
  };
}

export function importedName(
  context: Context,
  node: TSESTree.Node,
  bindings: ModuleBindings,
): string | undefined {
  return importedFunction(context, unwrapped(node), bindings);
}

export function calledName(
  context: Context,
  node: CallLike,
  bindings: ModuleBindings,
): string | undefined {
  const callee = unwrapped(node.callee);
  if (node.type === AST_NODE_TYPES.NewExpression && isModuleValue(context, callee, bindings)) {
    return 'default';
  }
  return importedFunction(context, callee, bindings);
}

function sourceOf(
  scope: EmitterScope,
  node: CallLike,
  field: SourceField,
): EmitterSource | undefined {
  return EMITTER_SOURCES.find((entry) =>
    entry[field].has(calledName(scope.context, node, scope.bindingsFor(entry.modules)) ?? ''),
  );
}

export function moduleOfFile(fileName: string): string | undefined {
  const matches = [...fileName.replaceAll('\\', '/').matchAll(MODULE_PATH)];
  return matches.at(-1)?.[1];
}

function isType(value: unknown): value is TypeScript.Type {
  return typeof value === 'object' && value !== null && 'flags' in value && 'getSymbol' in value;
}

function referenceTarget(type: TypeScript.Type): TypeScript.Type {
  const target: unknown = 'target' in type ? type.target : undefined;
  return isType(target) ? target : type;
}

function classChain(type: TypeScript.Type): TypeScript.Type[] {
  const seen = new Set<TypeScript.Type>();
  const pending = [type];
  for (const current of pending) {
    const target = referenceTarget(current);
    if (!seen.has(target) && seen.size < MAX_BASES) {
      seen.add(target);
      pending.push(...(target.getBaseTypes() ?? []));
    }
  }
  return [...seen];
}

function isEmitterClass(type: TypeScript.Type): boolean {
  const symbol = type.getSymbol();
  const fileName = symbol?.declarations?.[0]?.getSourceFile().fileName;
  return (
    symbol !== undefined &&
    fileName !== undefined &&
    isEmitterType(moduleOfFile(fileName), symbol.getName())
  );
}

function isTypedEmitter(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  if (services === undefined || !TYPESCRIPT_FILE.test(context.filename)) {
    return false;
  }
  return classChain(services.getTypeAtLocation(node)).some(isEmitterClass);
}

export function listensForErrors(context: Context, call: MemberCall): boolean {
  const event = stringValue(resolveConstant(context, call.arguments[0]));
  return isListenMethod(memberName(call.callee)) && event === 'error';
}

function chainedCalls(node: TSESTree.Node): TSESTree.Node[] {
  return chainOf<TSESTree.Node>(unwrapped(node), (current) =>
    current.type === AST_NODE_TYPES.CallExpression &&
    current.callee.type === AST_NODE_TYPES.MemberExpression &&
    isChainableMethod(memberName(current.callee))
      ? unwrapped(current.callee.object)
      : undefined,
  );
}

function branchesOf(node: TSESTree.Node): (TSESTree.Node | undefined)[] {
  const target = unwrapped(node);
  if (target.type === AST_NODE_TYPES.ConditionalExpression) {
    return [target.consequent, target.alternate];
  }
  return target.type === AST_NODE_TYPES.LogicalExpression ? [target.left, target.right] : [target];
}

function isUnheardCreation(scope: EmitterScope, node: TSESTree.Node): boolean {
  const chain = chainedCalls(node);
  const heard = chain
    .slice(0, -1)
    .some(
      (call) =>
        call.type === AST_NODE_TYPES.CallExpression &&
        isMemberCall(call) &&
        listensForErrors(scope.context, call),
    );
  return !heard && isDirectCreation(scope, chain.at(-1));
}

export function isEmitterCreation(scope: EmitterScope, node: TSESTree.Node | undefined): boolean {
  return (
    node !== undefined &&
    branchesOf(node).some((branch) => branch !== undefined && isUnheardCreation(scope, branch))
  );
}

function isDirectCreation(scope: EmitterScope, node: TSESTree.Node | undefined): boolean {
  const target = unwrapped(node);
  if (target?.type === AST_NODE_TYPES.CallExpression) {
    return sourceOf(scope, target, 'factories') !== undefined;
  }
  if (target?.type !== AST_NODE_TYPES.NewExpression) {
    return false;
  }
  return (
    sourceOf(scope, target, 'constructors') !== undefined || isTypedEmitter(scope.context, target)
  );
}

export function isServerCreation(scope: EmitterScope, node: TSESTree.Node | undefined): boolean {
  const target = unwrapped(node);
  const isCreation =
    target?.type === AST_NODE_TYPES.CallExpression || target?.type === AST_NODE_TYPES.NewExpression;
  return isCreation && sourceOf(scope, target, 'servers') !== undefined;
}
