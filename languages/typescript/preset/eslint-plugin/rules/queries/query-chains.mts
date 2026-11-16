import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../analysis/constant-resolution.mts';
import { moduleScope } from '../database/orm-modules.mts';
import { memberName, unwrapped, type Context } from '../security/security-values.mts';
import { assignedTarget } from '../typed/syntax-views.mts';
import {
  chainLibrary,
  libraryOf,
  type ChainScope,
  type Library,
} from './chains/chain-libraries.mts';

export type Step = {
  readonly name: string | undefined;
  readonly call: TSESTree.CallExpression;
  readonly object: TSESTree.Node;
};
export type ChainShape = { readonly root: TSESTree.Node | undefined; readonly steps: Step[] };
export type QueryChain = ChainShape & {
  readonly library: Library;
  readonly names: Set<string | undefined>;
};
type Expanded = ChainShape & { readonly related: Step[] };
type Names = { readonly names: ReadonlySet<string | undefined> };
type MaybeNode = TSESTree.Node | undefined;

const { DefinitionType } = TSESLint.Scope;
const ORDER_STEPS = new Set<string | undefined>(['orderBy', 'addOrderBy', 'orderByRaw']);
const OPAQUE_STEPS = new Set<string | undefined>([
  '$call',
  '$if',
  'modify',
  '$dynamic',
  'call',
  'apply',
  'pipe',
]);
const WRITE_STEPS = new Set<string | undefined>([
  'insert',
  'insertInto',
  'update',
  'updateTable',
  'delete',
  'deleteFrom',
  'del',
  'softDelete',
  'restore',
  'replaceInto',
  'mergeInto',
  'truncate',
  'relation',
]);
export function queryScope(context: Context): ChainScope {
  const scope = moduleScope(context);
  const sources = [...scope.bindings.values()].map(({ source }) => source);
  const libraries = new Set(
    sources.map(libraryOf).filter((library): library is Library => library !== undefined),
  );
  return { ...scope, libraries };
}

function stepOf(node: TSESTree.Node): Step | undefined {
  const call = unwrapped(node);
  const callee = call.type === AST_NODE_TYPES.CallExpression ? unwrapped(call.callee) : undefined;
  if (
    call.type !== AST_NODE_TYPES.CallExpression ||
    callee?.type !== AST_NODE_TYPES.MemberExpression
  ) {
    return undefined;
  }
  return { name: memberName(callee), call, object: unwrapped(callee.object) };
}

export function chainSteps(node: TSESTree.Node): ChainShape {
  const steps: Step[] = [];
  const pending: TSESTree.Node[] = [unwrapped(node)];
  for (const current of pending) {
    const step = stepOf(current);
    if (step !== undefined) {
      steps.unshift(step);
      pending.push(step.object);
    }
  }
  return { root: pending.at(-1), steps };
}

export function isOutermostStep(node: TSESTree.Node): boolean {
  const parent = node.parent;
  const member = parent?.type === AST_NODE_TYPES.MemberExpression && parent.object === node;
  return !(
    member &&
    parent.parent.type === AST_NODE_TYPES.CallExpression &&
    parent.parent.callee === parent
  );
}

function builderVariable(
  context: Context,
  identifier: MaybeNode,
): TSESLint.Scope.Variable | undefined {
  if (identifier?.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const variable = findVariable(context, identifier, identifier.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === DefinitionType.Variable && definition.node.init
    ? variable
    : undefined;
}

function referenceChain(reference: TSESLint.Scope.Reference): ChainShape | undefined {
  if (reference.isWrite()) {
    return reference.writeExpr ? chainSteps(reference.writeExpr) : undefined;
  }
  const identifier = reference.identifier;
  const member = identifier.parent;
  if (member.type !== AST_NODE_TYPES.MemberExpression || member.object !== identifier) {
    return undefined;
  }
  if (member.parent.type !== AST_NODE_TYPES.CallExpression || member.parent.callee !== member) {
    return { root: identifier, steps: [] };
  }
  const calls: TSESTree.CallExpression[] = [member.parent];
  for (const call of calls) {
    const next = isOutermostStep(call) ? undefined : call.parent.parent;
    if (next?.type === AST_NODE_TYPES.CallExpression) {
      calls.push(next);
    }
  }
  const [outermost] = calls.slice(-1);
  return outermost === undefined ? undefined : chainSteps(outermost);
}

function variableChains(variable: TSESLint.Scope.Variable): ChainShape[] | undefined {
  const chains = variable.references.map((reference) => referenceChain(reference));
  const found = chains.filter((chain): chain is ChainShape => chain !== undefined);
  return found.length === chains.length ? found : undefined;
}

function declaredRoot(variable: TSESLint.Scope.Variable): ChainShape | undefined {
  const [definition] = variable.defs;
  const init = definition?.type === DefinitionType.Variable ? definition.node.init : undefined;
  return init === undefined || init === null ? undefined : chainSteps(init);
}

function expandedChain(context: Context, node: TSESTree.Node): Expanded | undefined {
  const own = chainSteps(node);
  const variables = [own.root, assignedTarget(node)]
    .map((identifier) => builderVariable(context, identifier))
    .filter((variable): variable is TSESLint.Scope.Variable => variable !== undefined);
  const chains = variables.map((variable) => variableChains(variable));
  const resolved = chains.filter((chain): chain is ChainShape[] => chain !== undefined);
  if (resolved.length < chains.length) {
    return undefined;
  }
  const rootVariable = builderVariable(context, own.root);
  const related = resolved.flat().flatMap((chain) => chain.steps);
  if (rootVariable === undefined) {
    return { ...own, related };
  }
  const declared = declaredRoot(rootVariable);
  if (declared === undefined || declared.steps.length === 0) {
    return undefined;
  }
  return { root: declared.root, steps: [...declared.steps, ...own.steps], related };
}

/**
 * The query chain that ends at `node`: its library, its steps from the root, and the names of every
 * step that the local builder variable holding it gets elsewhere. `undefined` when `node` is not a
 * query builder, or when the builder escapes into code this rule cannot see.
 */
export function queryChain(scope: ChainScope, node: TSESTree.Node): QueryChain | undefined {
  const chain = expandedChain(scope.context, node);
  if (chain === undefined) {
    return undefined;
  }
  const names = new Set([...chain.steps, ...chain.related].map((step) => step.name));
  const library = chainLibrary(scope, chain.root, names);
  return library === undefined
    ? undefined
    : { library, steps: chain.steps, names, root: chain.root };
}

export function isOrdered(chain: Names): boolean {
  return [...chain.names].some((name) => ORDER_STEPS.has(name));
}

export function isOpaque(chain: Names): boolean {
  return [...chain.names].some((name) => OPAQUE_STEPS.has(name));
}

export function isWrite(chain: Names): boolean {
  return [...chain.names].some((name) => WRITE_STEPS.has(name));
}
