import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chainOf, isNode, nameOf, variableNamed, type SourceCode } from '../typed/node-views.mts';
import { memberKeyOf } from '../typed/syntax-views.mts';
import { reportedNode, ruleModule, withReportFilter, type Context } from './report-filter.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

type MessageId = 'nonAtomicUpdate' | 'nonAtomicObjectUpdate';
type Options = readonly unknown[];
type Variable = TSESLint.Scope.Variable;
type Transparent =
  | TSESTree.TSNonNullExpression
  | TSESTree.TSAsExpression
  | TSESTree.TSSatisfiesExpression
  | TSESTree.ChainExpression;
type Source = { readonly node: TSESTree.Node; readonly keys: readonly string[] };
type Chain = {
  readonly root: TSESTree.Identifier;
  readonly members: TSESTree.MemberExpression[];
  readonly keys: string[];
};
type Reads = {
  readonly sourceCode: SourceCode;
  readonly functionScope: TSESLint.Scope.Scope;
  readonly seen: Map<Variable, Set<string>>;
};

const { DefinitionType } = TSESLint.Scope;
const requireFromHere = createRequire(import.meta.url);
const eslintRules = path.join(path.dirname(requireFromHere.resolve('eslint')), 'rules');
const loadedRule: unknown = requireFromHere(path.join(eslintRules, 'require-atomic-updates.js'));
const baseRule = ruleModule<MessageId, Options, unknown>(loadedRule, 'require-atomic-updates');

const ANY_KEY = '*';
const MAX_KEYS = 16;
const SKIPPED_KEYS = new Set(['parent', 'typeAnnotation', 'typeArguments', 'typeParameters']);
const CHAIN_TYPES = new Set<string>([AST_NODE_TYPES.Identifier, AST_NODE_TYPES.MemberExpression]);

function isTransparent(node: TSESTree.Node): node is Transparent {
  return (
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.ChainExpression
  );
}

function isMember(node: TSESTree.Node): node is TSESTree.MemberExpression {
  return node.type === AST_NODE_TYPES.MemberExpression;
}

function unwrapped(node: TSESTree.Node): TSESTree.Node | undefined {
  return chainOf<TSESTree.Node>(node, (inner) =>
    isTransparent(inner) ? inner.expression : undefined,
  ).at(-1);
}

function memberChain(expression: TSESTree.Node): Chain | undefined {
  const nodes = chainOf<TSESTree.Node>(unwrapped(expression), (node) =>
    node.type === AST_NODE_TYPES.MemberExpression ? unwrapped(node.object) : undefined,
  );
  const root = nodes.at(-1);
  if (root?.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const members = nodes.slice(0, -1).filter(isMember);
  return {
    root,
    members,
    keys: members.map((member) => memberKeyOf(member, ANY_KEY)).toReversed(),
  };
}

function overlaps(read: readonly string[], written: readonly string[]): boolean {
  const shared = Math.min(read.length, written.length);
  return read
    .slice(0, shared)
    .every((key, index) => key === written[index] || key === ANY_KEY || written[index] === ANY_KEY);
}

function propertyName(key: TSESTree.Node): string {
  return nameOf(key) ?? String(key.type === AST_NODE_TYPES.Literal ? key.value : undefined);
}

function patternStep(
  keys: readonly string[],
  child: TSESTree.Node | undefined,
  parent: TSESTree.Node,
): readonly string[] | undefined {
  if (parent.type === AST_NODE_TYPES.RestElement) {
    return [];
  }
  if (parent.type === AST_NODE_TYPES.Property && parent.value === child) {
    return [parent.computed ? ANY_KEY : propertyName(parent.key), ...keys];
  }
  if (parent.type === AST_NODE_TYPES.ArrayPattern) {
    return [ANY_KEY, ...keys];
  }
  return parent.type === AST_NODE_TYPES.AssignmentPattern ||
    parent.type === AST_NODE_TYPES.ObjectPattern
    ? keys
    : undefined;
}

function patternKeys(identifier: TSESTree.Identifier | TSESTree.JSXIdentifier): readonly string[] {
  const nodes = chainOf<TSESTree.Node>(identifier, (node) =>
    node.parent !== undefined && node.parent.type !== AST_NODE_TYPES.VariableDeclarator
      ? node.parent
      : undefined,
  );
  let keys: readonly string[] | undefined = [];
  for (const [index, parent] of nodes.slice(1).entries()) {
    keys = patternStep(keys, nodes[index], parent);
    if (keys === undefined) {
      return [];
    }
  }
  return keys;
}

function childrenOf(node: TSESTree.Node): TSESTree.Node[] {
  if (node.type === AST_NODE_TYPES.Property && !node.computed) {
    return [node.value];
  }
  if (node.type === AST_NODE_TYPES.MemberExpression && !node.computed) {
    return [node.object];
  }
  return Object.keys(node)
    .filter((key) => !SKIPPED_KEYS.has(key))
    .flatMap((key) => {
      const value: unknown = Reflect.get(node, key);
      const values: unknown[] = Array.isArray(value) ? value : [value];
      return values;
    })
    .filter(isNode);
}

function firstVisit(
  seen: Map<Variable, Set<string>>,
  variable: Variable,
  keys: readonly string[],
): boolean {
  const visited = seen.get(variable) ?? new Set<string>();
  seen.set(variable, visited);
  const key = keys.join('\0');
  const first = !visited.has(key);
  visited.add(key);
  return first;
}

function sourceOf(
  reference: TSESLint.Scope.Reference,
  writeExpr: TSESTree.Node,
  keys: readonly string[],
): Source {
  const source = memberChain(writeExpr);
  if (source === undefined) {
    return { node: writeExpr, keys: [] };
  }
  return {
    node: source.root,
    keys: [...source.keys, ...patternKeys(reference.identifier), ...keys],
  };
}

function sourcesOf(variable: Variable, keys: readonly string[]): Source[] {
  return variable.references.flatMap((reference) => {
    const { writeExpr } = reference;
    return reference.isWrite() && writeExpr !== null && writeExpr !== undefined
      ? [sourceOf(reference, writeExpr, keys)]
      : [];
  });
}

function isFunctionLocal(
  variable: Variable | undefined,
  functionScope: TSESLint.Scope.Scope,
): variable is Variable {
  return (
    variable?.scope.variableScope === functionScope &&
    variable.defs.every(({ type }) => type === DefinitionType.Variable)
  );
}

function expansionOf(chain: Chain, suffix: readonly string[], context: Reads): Source[] {
  const variable = variableNamed(context.sourceCode, chain.root);
  const expands =
    isFunctionLocal(variable, context.functionScope) &&
    suffix.length <= MAX_KEYS &&
    firstVisit(context.seen, variable, suffix);
  return expands ? sourcesOf(variable, suffix) : [];
}

function chainReads(
  chain: Chain,
  keys: readonly string[],
  context: Reads,
): { readonly path: string[]; readonly next: Source[] } {
  const suffix = [...chain.keys, ...keys];
  const computed = chain.members.filter((member) => member.computed);
  return {
    path: suffix.length > MAX_KEYS ? [ANY_KEY] : [chain.root.name, ...suffix],
    next: [
      ...computed.map((member) => ({ node: member.property, keys: [] })),
      ...expansionOf(chain, suffix, context),
    ],
  };
}

function readPaths(
  start: TSESTree.Node,
  sourceCode: SourceCode,
  functionScope: TSESLint.Scope.Scope,
): string[][] {
  const context: Reads = { sourceCode, functionScope, seen: new Map() };
  const paths: string[][] = [];
  const pending: Source[] = [{ node: start, keys: [] }];
  for (const { node, keys } of pending) {
    const chain = CHAIN_TYPES.has(node.type) ? memberChain(node) : undefined;
    if (chain === undefined) {
      appendAll(
        pending,
        childrenOf(node).map((child) => ({ node: child, keys: [] })),
      );
    } else {
      const { path: read, next } = chainReads(chain, keys, context);
      paths.push(read);
      appendAll(pending, next);
    }
  }
  return paths;
}

function readsWrittenLocation(
  assignment: TSESTree.AssignmentExpression,
  sourceCode: SourceCode,
): boolean {
  const written = memberChain(assignment.left);
  if (written === undefined) {
    return true;
  }
  const functionScope = sourceCode.getScope(assignment).variableScope;
  const target = [written.root.name, ...written.keys];
  return readPaths(assignment.right, sourceCode, functionScope).some((read) =>
    overlaps(read, target),
  );
}

function keepsReport(
  descriptor: TSESLint.ReportDescriptor<MessageId>,
  context: Context<MessageId, Options>,
): boolean {
  const node = reportedNode(descriptor);
  return (
    node?.type !== AST_NODE_TYPES.AssignmentExpression ||
    node.operator !== '=' ||
    readsWrittenLocation(node, context.sourceCode)
  );
}

export const rule: TSESLint.RuleModule<MessageId, Options> = withReportFilter(
  baseRule,
  keepsReport,
);
