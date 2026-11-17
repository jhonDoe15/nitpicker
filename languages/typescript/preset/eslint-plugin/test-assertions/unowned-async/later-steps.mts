import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode, type SourceContext } from '../../rules/analysis/constant-resolution.mts';
import { ancestorsOf } from '../../rules/typed/node-views.mts';
import { hostShape, resolvedFunction, type Host } from './hosts.mts';
import {
  isCallLike,
  literalDelay,
  nodeFacts,
  UNKNOWN_DELAY,
  type Facts,
} from './node-facts/node-facts.mts';
import { children, nodesIn, type Env, type FunctionNode } from './nodes.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

const { DefinitionType } = TSESLint.Scope;

function runsInline({ context, bindings }: Env, node: TSESTree.Node): boolean {
  if (!isFunctionNode(node)) {
    return true;
  }
  const call = node.parent;
  const isPassed =
    isCallLike(call) &&
    (call.arguments.some((argument) => argument === node) || call.callee === node);
  return isPassed && hostShape(context, call, bindings) === undefined;
}

function unfollowedHelper(
  env: Env,
  node: TSESTree.Node,
  followed: Set<FunctionNode>,
): TSESTree.Node | undefined {
  const helper =
    node.type === AST_NODE_TYPES.CallExpression
      ? resolvedFunction(env.context, node.callee)
      : undefined;
  if (helper === undefined || followed.has(helper)) {
    return undefined;
  }
  followed.add(helper);
  return helper.body;
}

function reachableNodes(env: Env, roots: readonly TSESTree.Node[]): TSESTree.Node[] {
  const pending = [...new Set(roots)];
  const followed = new Set<FunctionNode>();
  const found: TSESTree.Node[][] = [];
  for (const root of pending) {
    const own = nodesIn(env.context, root, (child) => runsInline(env, child));
    const bodies = own.map((node) => unfollowedHelper(env, node, followed));
    found.push(own);
    appendAll(
      pending,
      bodies.filter((body) => body !== undefined),
    );
  }
  return found.flat();
}

export function stepFacts(
  env: Env,
  roots: readonly TSESTree.Node[],
  owners: ReadonlySet<TSESTree.Node>,
): Facts {
  const facts = reachableNodes(env, roots).map((node) => nodeFacts(env.context, node, owners));
  return {
    waits: facts.some((fact) => fact.waits),
    drains: facts.flatMap((fact) => fact.drains),
    advances: facts.some((fact) => fact.advances),
    flushesMicrotasks: facts.some((fact) => fact.flushesMicrotasks),
    writes: facts.some((fact) => fact.writes),
    triggers: facts.some((fact) => fact.triggers),
  };
}

function laterSiblings(context: SourceContext, node: TSESTree.Node): TSESTree.Node[] {
  return children(context, node.parent).filter((sibling) => sibling.range[0] >= node.range[1]);
}

function climb(start: TSESTree.Node, test: TSESTree.Node): TSESTree.Node[] {
  const chain = [start, ...ancestorsOf(start)];
  const stop = chain.indexOf(test);
  return stop === -1 ? chain : chain.slice(0, stop);
}

function namedBinding(
  fn: FunctionNode,
): TSESTree.FunctionDeclaration | TSESTree.VariableDeclarator | undefined {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return fn;
  }
  return fn.parent.type === AST_NODE_TYPES.VariableDeclarator && fn.parent.init === fn
    ? fn.parent
    : undefined;
}

function localUses(context: SourceContext, node: TSESTree.Node): TSESTree.Node[] {
  const binding = isFunctionNode(node) ? namedBinding(node) : undefined;
  const variable =
    binding === undefined
      ? undefined
      : context.sourceCode
          .getDeclaredVariables(binding)
          .find((candidate) =>
            candidate.defs.some(
              (def) => def.node === binding && def.type !== DefinitionType.Parameter,
            ),
          );
  return (variable?.references ?? []).filter((ref) => !ref.init).map((ref) => ref.identifier);
}

function rootsFrom(
  context: SourceContext,
  start: TSESTree.Node,
  test: TSESTree.Node,
): { roots: TSESTree.Node[]; uses: TSESTree.Node[] } {
  const roots: TSESTree.Node[] = [];
  for (const node of climb(start, test)) {
    for (const sibling of laterSiblings(context, node)) {
      roots.push(sibling);
    }
    const uses = localUses(context, node);
    if (uses.length > 0) {
      return { roots, uses };
    }
  }
  return { roots, uses: [] };
}

export function ownerRoots(
  context: SourceContext,
  host: Host,
  test: TSESTree.Node,
): TSESTree.Node[] {
  const starts = new Set<TSESTree.Node>([host.node]);
  const roots: TSESTree.Node[] = [];
  for (const start of starts) {
    const found = rootsFrom(context, start, test);
    for (const root of found.roots) {
      roots.push(root);
    }
    for (const use of found.uses) {
      starts.add(use);
    }
  }
  return roots;
}

function hostDelay(host: Host): number {
  const delay =
    host.node.type === AST_NODE_TYPES.CallExpression && host.name === 'setTimeout'
      ? literalDelay(host.node.arguments[1], 0)
      : 0;
  return delay === UNKNOWN_DELAY ? 0 : delay;
}

export function isOwnedByLaterStep(host: Host, facts: Facts): boolean {
  if (host.kind === 'timer') {
    return facts.advances || facts.drains.some((drain) => drain >= hostDelay(host));
  }
  if (host.kind === 'microtask') {
    return facts.waits || facts.flushesMicrotasks;
  }
  return host.kind === 'listener' && (facts.waits || facts.writes || facts.triggers);
}
