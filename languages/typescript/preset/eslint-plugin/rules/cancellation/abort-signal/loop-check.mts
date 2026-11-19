import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { syntaxChildren } from '../../decided/syntax.mts';
import {
  contains,
  depthFirst,
  nameOf,
  variableNamed,
  type SourceCode,
} from '../../typed/node-views.mts';
import { signalsInScope, type Signals } from './signal-scope.mts';

type Context = Readonly<TSESLint.RuleContext<'notForwarded' | 'loopIgnoresSignal', readonly []>>;
type Loop = TSESTree.WhileStatement | TSESTree.DoWhileStatement | TSESTree.ForStatement;

const FUNCTIONS = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);

function isEndless(node: Loop): boolean {
  if (node.type === AST_NODE_TYPES.ForStatement) {
    return node.test === null || isTrue(node.test);
  }
  return isTrue(node.test);
}

function isTrue(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && node.value === true;
}

function awaitsDirectly(node: TSESTree.Node): boolean {
  return [
    ...depthFirst<TSESTree.Node>(node, (current) =>
      FUNCTIONS.has(current.type) ? [] : syntaxChildren(current),
    ),
  ].some(
    (current) =>
      current.type === AST_NODE_TYPES.AwaitExpression ||
      (current.type === AST_NODE_TYPES.ForOfStatement && current.await),
  );
}

const ABORT_LISTENERS = new Set<string>(['addEventListener', 'onabort', 'addListener']);
const MAX_HOPS = 3;

function listensForAbort(variable: TSESLint.Scope.Variable): boolean {
  return variable.references.some((reference) => {
    const member = reference.identifier.parent;
    return (
      member.type === AST_NODE_TYPES.MemberExpression &&
      member.object === reference.identifier &&
      ABORT_LISTENERS.has(nameOf(member.property) ?? '')
    );
  });
}

function valueIdentifiers(root: TSESTree.Node): TSESTree.Identifier[] {
  return [...depthFirst<TSESTree.Node>(root, syntaxChildren)].filter(
    (node): node is TSESTree.Identifier =>
      node.type === AST_NODE_TYPES.Identifier &&
      !(
        node.parent.type === AST_NODE_TYPES.MemberExpression &&
        node.parent.property === node &&
        !node.parent.computed
      ),
  );
}

type Hop = { readonly node: TSESTree.Node; readonly hops: number };

function initializersOf(
  sourceCode: SourceCode,
  identifiers: readonly TSESTree.Identifier[],
): TSESTree.Expression[] {
  return identifiers.flatMap((identifier) => {
    const declarator = variableNamed(sourceCode, identifier)?.defs[0]?.node;
    const init =
      declarator?.type === AST_NODE_TYPES.VariableDeclarator ? declarator.init : undefined;
    return init === null || init === undefined ? [] : [init];
  });
}

function derivesFromSignal(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  names: ReadonlySet<string>,
): boolean {
  const pending: Hop[] = [{ node, hops: 0 }];
  for (const item of pending) {
    const identifiers = valueIdentifiers(item.node);
    if (identifiers.some((identifier) => names.has(identifier.name))) {
      return true;
    }
    const next = item.hops < MAX_HOPS ? initializersOf(sourceCode, identifiers) : [];
    for (const init of next) {
      pending.push({ node: init, hops: item.hops + 1 });
    }
  }
  return false;
}

function awaitedValues(body: TSESTree.Node): TSESTree.Node[] {
  return [
    ...depthFirst<TSESTree.Node>(body, (current) =>
      FUNCTIONS.has(current.type) ? [] : syntaxChildren(current),
    ),
  ].flatMap((current) =>
    current.type === AST_NODE_TYPES.AwaitExpression ? [current.argument] : [],
  );
}

function reactsToAbort(
  sourceCode: SourceCode,
  loop: Loop,
  candidates: readonly TSESLint.Scope.Variable[],
): boolean {
  const names = new Set(candidates.map((variable) => variable.name));
  return (
    candidates.some(listensForAbort) ||
    awaitedValues(loop.body).some((value) => derivesFromSignal(sourceCode, value, names))
  );
}

export function infiniteLoopHandlers(context: Context, signals: Signals): TSESLint.RuleListener {
  function check(node: Loop): void {
    if (!(isEndless(node) && awaitsDirectly(node.body))) {
      return;
    }
    const candidates = signalsInScope(context.sourceCode.getScope(node), signals);
    const first = candidates[0];
    const mentioned = candidates.some((variable) =>
      variable.references.some((reference) => contains(node, reference.identifier)),
    );
    if (first !== undefined && !mentioned && !reactsToAbort(context.sourceCode, node, candidates)) {
      context.report({ node, messageId: 'loopIgnoresSignal', data: { name: first.name } });
    }
  }
  return { WhileStatement: check, DoWhileStatement: check, ForStatement: check };
}
