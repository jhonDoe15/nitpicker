import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  foldTerm,
  isSideEffectFree,
  type Range,
  type Term,
} from '../../analysis/logic/term-views.mts';
import { scopeChain, type SourceCode } from '../../typed/node-views.mts';
import {
  isCallExpression,
  soleReturnedValue,
  type FunctionNode,
} from '../../typed/syntax-views.mts';
import { inside, rangeKey } from '../syntax.mts';

type Helper = {
  readonly name: string;
  readonly params: readonly string[];
  readonly body: TSESTree.Expression;
};
type Source = {
  readonly sourceCode: SourceCode;
  readonly build: (node: TSESTree.Node) => Term;
};
type Context = Source & { readonly site: TSESLint.Scope.Scope };
type HelperNote = { readonly name: string; readonly text: string };

const { DefinitionType } = TSESLint.Scope;
const MODULE_SCOPES = new Set<string>(['module', 'global']);
const CALL = 'call';

function variableAt(
  scope: TSESLint.Scope.Scope,
  name: string,
): TSESLint.Scope.Variable | undefined {
  return scopeChain(scope)
    .find((current) => current.set.has(name))
    ?.set.get(name);
}

function valueOf(init: TSESTree.Expression | null): FunctionNode | undefined {
  return init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    init?.type === AST_NODE_TYPES.FunctionExpression
    ? init
    : undefined;
}

function functionOf(variable: TSESLint.Scope.Variable): FunctionNode | undefined {
  const [definition] = variable.defs;
  const isOnly = variable.defs.length === 1 && MODULE_SCOPES.has(variable.scope.type);
  if (definition === undefined || !isOnly) {
    return undefined;
  }
  if (definition.type === DefinitionType.FunctionName) {
    return definition.node.type === AST_NODE_TYPES.FunctionDeclaration
      ? definition.node
      : undefined;
  }
  const isConst = definition.type === DefinitionType.Variable && definition.parent.kind === 'const';
  return isConst ? valueOf(definition.node.init) : undefined;
}

function returnedExpression(fn: FunctionNode): TSESTree.Expression | undefined {
  if (fn.async || fn.generator) {
    return undefined;
  }
  return soleReturnedValue(fn);
}

function parameterNames(fn: FunctionNode): string[] | undefined {
  const names = fn.params.flatMap((param) =>
    param.type === AST_NODE_TYPES.Identifier ? [param.name] : [],
  );
  return names.length === fn.params.length && new Set(names).size === names.length
    ? names
    : undefined;
}

function readsOnlyKnown(fn: FunctionNode, { sourceCode, site }: Context): boolean {
  const scope = sourceCode.scopeManager?.acquire(fn);
  return (
    scope !== null &&
    scope !== undefined &&
    scope.through.every(
      (reference) =>
        reference.resolved === null ||
        variableAt(site, reference.identifier.name) === reference.resolved,
    )
  );
}

function helperOf(call: TSESTree.CallExpression, context: Context): Helper | undefined {
  const { callee } = call;
  if (callee.type !== AST_NODE_TYPES.Identifier || call.optional) {
    return undefined;
  }
  const variable = variableAt(context.sourceCode.getScope(call), callee.name);
  const fn = variable === undefined ? undefined : functionOf(variable);
  const body = fn === undefined ? undefined : returnedExpression(fn);
  const params = fn === undefined ? undefined : parameterNames(fn);
  const isClosed =
    fn !== undefined &&
    body !== undefined &&
    params !== undefined &&
    params.length === call.arguments.length &&
    readsOnlyKnown(fn, context);
  return isClosed ? { name: callee.name, params, body } : undefined;
}

function substituted(body: Term, params: readonly string[], args: readonly Term[]): Term {
  const bindings = new Map<string, Term | undefined>(
    params.map((name, index): [string, Term | undefined] => [name, args[index]]),
  );
  return foldTerm<Term>(body, (node, children) => {
    const bound =
      node.kind === 'name' && node.value !== undefined ? bindings.get(node.value) : undefined;
    return bound ?? { ...node, children };
  });
}

function hasNamedAtom(root: Term): boolean {
  return foldTerm<boolean>(
    root,
    (node, children) =>
      (node.kind === 'name' && node.value?.startsWith('#') === true) || children.some(Boolean),
  );
}

function tagged(base: Term, range: Range | undefined, helper: HelperNote): Term {
  const note = { ...base, range, helper };
  return note;
}

function innerExpansions(helper: Helper, context: Context): [TSESTree.CallExpression, Helper][] {
  return [...inside(helper.body)].filter(isCallExpression).flatMap((call) => {
    const inner = helperOf(call, context);
    return inner === undefined ? [] : [[call, inner]];
  });
}

function withInner(helper: Helper, context: Context): Term {
  const byRange = new Map(
    innerExpansions(helper, context).map(([call, inner]): [string, Helper] => [
      rangeKey(call.range),
      inner,
    ]),
  );
  return foldTerm<Term>(context.build(helper.body), (node, children) => {
    const inner =
      node.kind === CALL && node.range !== undefined
        ? byRange.get(rangeKey(node.range))
        : undefined;
    if (inner === undefined) {
      return { ...node, children };
    }
    const text = context.sourceCode.getText(inner.body);
    const expanded = substituted(context.build(inner.body), inner.params, children.slice(1));
    return tagged(expanded, node.range, { name: inner.name, text });
  });
}

function expandedCall(
  call: TSESTree.CallExpression,
  node: Term,
  context: Context,
): Term | undefined {
  const helper = helperOf(call, context);
  if (helper === undefined) {
    return undefined;
  }
  const body = withInner(helper, context);
  if (hasNamedAtom(body)) {
    return undefined;
  }
  const args = node.children.slice(1);
  const expanded = substituted(body, helper.params, args);
  const text = context.sourceCode.getText(helper.body);
  return isSideEffectFree(expanded) && args.every((arg) => isSideEffectFree(arg))
    ? tagged(expanded, node.range, { name: helper.name, text })
    : undefined;
}

/**
 * `built` (made from `root`) with each call of a same-file module function that only returns a
 * side-effect-free expression replaced by that expression, its parameters bound to the arguments,
 * through at most 2 levels. `build` turns a syntax node into a term of the same kind as `built`.
 */
export function withPredicateCalls(built: Term, root: TSESTree.Node, source: Source): Term {
  const calls = new Map(
    [...inside(root)]
      .filter(isCallExpression)
      .map((node): [string, TSESTree.CallExpression] => [rangeKey(node.range), node]),
  );
  if (calls.size === 0) {
    return built;
  }
  return foldTerm<Term>(built, (node, children) => {
    const call =
      node.kind === CALL && node.range !== undefined ? calls.get(rangeKey(node.range)) : undefined;
    const rebuilt: Term = { ...node, children };
    if (call === undefined) {
      return rebuilt;
    }
    const context = { ...source, site: source.sourceCode.getScope(call) };
    return expandedCall(call, rebuilt, context) ?? rebuilt;
  });
}
