import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { unwrapped } from '../security/security-values.mts';
import {
  ancestorsOf,
  chainOf,
  depthFirst,
  nodeChildren,
  type SourceCode,
} from '../typed/node-views.mts';
import {
  enclosingFunction,
  isCalleeUse,
  isAuthName,
  reachedVariables,
  scopeContains,
  variableOf,
  type Variable,
} from './scope-names.mts';
import type { FunctionNode } from '../typed/syntax-views.mts';

export type MissingInput = { readonly call: TSESTree.CallExpression; readonly names: string[] };

const { DefinitionType, ScopeType } = TSESLint.Scope;
const IGNORED_NAMES = /^(logger|log|signal|abortSignal|ctx|context|ct|cancellationToken)$/i;
const IGNORED_TYPES = /\b(Logger|AbortSignal|Context|CancellationToken)\b/;
const LOG_ROOTS = new Set(['log', 'logger', 'console']);

function isKeyBuilder(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.TemplateLiteral) {
    return value.expressions.length > 0;
  }
  if (value.type === AST_NODE_TYPES.BinaryExpression) {
    return value.operator === '+';
  }
  if (value.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = value.callee;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.property.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  const joined =
    callee.property.name === 'join' && callee.object.type === AST_NODE_TYPES.ArrayExpression;
  const stringified =
    callee.property.name === 'stringify' &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'JSON';
  return joined || stringified;
}

function memberRoot(start: TSESTree.Node): TSESTree.Node {
  const chain = chainOf<TSESTree.Node>(start, (link) =>
    link.type === AST_NODE_TYPES.MemberExpression ? link.object : undefined,
  );
  return chain.at(-1) ?? start;
}

function callRootName(call: TSESTree.CallExpression): string | undefined {
  const root = memberRoot(call.callee);
  return root.type === AST_NODE_TYPES.Identifier ? root.name : undefined;
}

function isLogCall(call: TSESTree.CallExpression): boolean {
  const name = callRootName(call);
  const { callee } = call;
  const logProperty =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.property.type === AST_NODE_TYPES.Identifier &&
    LOG_ROOTS.has(callee.object.property.name);
  return (name !== undefined && LOG_ROOTS.has(name)) || logProperty;
}

function isLogged(identifier: TSESTree.Identifier): boolean {
  return ancestorsOf(identifier).some(
    (node) => node.type === AST_NODE_TYPES.CallExpression && isLogCall(node),
  );
}

function parameterVariables(scope: TSESLint.Scope.Scope): Set<Variable> {
  return new Set(
    scope.variables.filter(
      (variable) =>
        variable.name !== 'arguments' &&
        variable.defs.some((entry) => entry.type === DefinitionType.Parameter),
    ),
  );
}

function ignoredParameter(variable: Variable, sourceCode: SourceCode): boolean {
  if (IGNORED_NAMES.test(variable.name) || isAuthName(variable.name)) {
    return true;
  }
  return variable.identifiers.some(
    (identifier) =>
      identifier.typeAnnotation !== undefined &&
      IGNORED_TYPES.test(sourceCode.getText(identifier.typeAnnotation)),
  );
}

function keyDeclarator(
  node: TSESTree.VariableDeclarator,
): { readonly name: string; readonly init: TSESTree.Expression } | undefined {
  const parent = node.parent;
  if (parent.kind !== 'const' || node.id.type !== AST_NODE_TYPES.Identifier || node.init === null) {
    return undefined;
  }
  return isKeyBuilder(node.init) ? { name: node.id.name, init: node.init } : undefined;
}

function cacheCalls(variable: Variable, method: ReadonlySet<string>) {
  return variable.references.flatMap((reference) => {
    const argument = reference.identifier;
    const call = argument.parent;
    if (call.type !== AST_NODE_TYPES.CallExpression || call.arguments[0] !== argument) {
      return [];
    }
    const callee = call.callee;
    const named =
      callee.type === AST_NODE_TYPES.MemberExpression &&
      !callee.computed &&
      callee.property.type === AST_NODE_TYPES.Identifier &&
      method.has(callee.property.name);
    return named ? [call] : [];
  });
}

function outlivesCall(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  scope: TSESLint.Scope.Scope,
): boolean {
  const start =
    call.callee.type === AST_NODE_TYPES.MemberExpression ? call.callee.object : call.callee;
  const shared = start.type === AST_NODE_TYPES.MemberExpression;
  const root = memberRoot(start);
  if (root.type === AST_NODE_TYPES.ThisExpression) {
    return shared;
  }
  const variable =
    root.type === AST_NODE_TYPES.Identifier ? variableOf(sourceCode, root) : undefined;
  if (variable === undefined) {
    return false;
  }
  if (!scopeContains(scope, variable.scope)) {
    return true;
  }
  const isParameter = variable.defs.some(
    (definition) => definition.type === DefinitionType.Parameter,
  );
  return (
    !isParameter &&
    variable.references.some((reference) => readsOuterCache(sourceCode, reference, scope))
  );
}

function readsOuterCache(
  sourceCode: SourceCode,
  reference: TSESLint.Scope.Reference,
  scope: TSESLint.Scope.Scope,
): boolean {
  const written = reference.writeExpr;
  return (
    written !== null &&
    written !== undefined &&
    [...depthFirst<TSESTree.Node>(written, nodeChildren)].some((node) => {
      const outer =
        node.type === AST_NODE_TYPES.Identifier ? variableOf(sourceCode, node) : undefined;
      return (
        outer !== undefined &&
        outer.scope.type !== ScopeType.global &&
        !scopeContains(scope, outer.scope) &&
        outer.defs.every((definition) => definition.type !== DefinitionType.ImportBinding)
      );
    })
  );
}

function returnsCached(
  sourceCode: SourceCode,
  fn: FunctionNode,
  readers: readonly TSESTree.CallExpression[],
): boolean {
  function isReader(node: TSESTree.Node): boolean {
    return node.type === AST_NODE_TYPES.CallExpression && readers.includes(node);
  }
  const returned = [...depthFirst<TSESTree.Node>(fn.body, nodeChildren)].filter(
    (node) => node.type === AST_NODE_TYPES.ReturnStatement && node.argument !== null,
  );
  return returned.some((statement) =>
    [...depthFirst<TSESTree.Node>(statement, nodeChildren)].some((node) => {
      if (isReader(node)) {
        return true;
      }
      const variable =
        node.type === AST_NODE_TYPES.Identifier ? variableOf(sourceCode, node) : undefined;
      return variable?.references.some(
        (reference) =>
          reference.writeExpr !== null &&
          reference.writeExpr !== undefined &&
          [...depthFirst<TSESTree.Node>(reference.writeExpr, nodeChildren)].some(isReader),
      );
    }),
  );
}

function receiverText(sourceCode: SourceCode, call: TSESTree.CallExpression): string | undefined {
  return call.callee.type === AST_NODE_TYPES.MemberExpression
    ? sourceCode.getText(call.callee.object)
    : undefined;
}

type CacheContext = {
  readonly sourceCode: SourceCode;
  readonly fn: FunctionNode;
  readonly scope: TSESLint.Scope.Scope;
  readonly parameters: ReadonlySet<Variable>;
  readonly keyInputs: ReadonlyMap<Variable, unknown>;
};

function isClearedInFile(sourceCode: SourceCode, receiver: string | undefined): boolean {
  return (
    receiver !== undefined &&
    [...depthFirst<TSESTree.Node>(sourceCode.ast, nodeChildren)].some(
      (node) =>
        node.type === AST_NODE_TYPES.CallExpression &&
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.property.type === AST_NODE_TYPES.Identifier &&
        node.callee.property.name === 'clear' &&
        sourceCode.getText(node.callee.object) === receiver,
    )
  );
}

function missingFor(
  context: CacheContext,
  setter: TSESTree.CallExpression,
  readers: readonly TSESTree.CallExpression[],
): MissingInput | undefined {
  const { sourceCode, fn, scope, parameters, keyInputs } = context;
  const receiver = receiverText(sourceCode, setter);
  const value = setter.arguments[1];
  const sameReceiver = readers.filter((read) => receiverText(sourceCode, read) === receiver);
  const cached = sameReceiver.length > 0 && outlivesCall(sourceCode, setter, scope);
  if (value === undefined || !cached || !returnsCached(sourceCode, fn, sameReceiver)) {
    return undefined;
  }
  const names = [...reachedVariables(sourceCode, value, scope)]
    .filter(([input]) => parameters.has(input) && !keyInputs.has(input))
    .filter(([input]) => !ignoredParameter(input, sourceCode))
    .filter(([, uses]) => uses.some((use) => !(isCalleeUse(use) || isLogged(use))))
    .map(([input]) => input.name);
  return names.length > 0 && !isClearedInFile(sourceCode, receiver)
    ? { call: setter, names }
    : undefined;
}

export function missingInputs(
  sourceCode: SourceCode,
  declarator: TSESTree.VariableDeclarator,
): MissingInput[] {
  const key = keyDeclarator(declarator);
  const fn: FunctionNode | undefined = enclosingFunction(declarator);
  const [variable] = sourceCode.getDeclaredVariables(declarator);
  if (key === undefined || fn === undefined || variable === undefined) {
    return [];
  }
  const scope = sourceCode.getScope(fn);
  const context = {
    sourceCode,
    fn,
    scope,
    parameters: parameterVariables(scope),
    keyInputs: reachedVariables(sourceCode, key.init, scope),
  };
  const readers = cacheCalls(variable, new Set(['get', 'has']));
  return cacheCalls(variable, new Set(['set'])).flatMap((setter) => {
    const found = missingFor(context, setter, readers);
    return found === undefined ? [] : [found];
  });
}
