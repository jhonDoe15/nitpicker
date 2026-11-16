import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../analysis/constant-resolution.mts';
import { ancestorsOf, nameOf, type SourceCode } from '../typed/node-views.mts';

type MessageId = 'recursion' | 'domainRecursion' | 'mutualRecursion';
type Edge = {
  readonly source: TSESTree.Node;
  readonly target: TSESTree.Node;
  readonly node: TSESTree.Node;
};

const { DefinitionType } = TSESLint.Scope;
const EXCEPTION_ROUTE = ' An exception fits only when the recursion is bounded and deliberate.';
const DOMAIN_PATH = /(?:^|\/)features\/[^/]+\/domain\//;

function boundFunction(definition: TSESLint.Scope.Definition): TSESTree.Node | undefined {
  if (definition.type === DefinitionType.FunctionName) {
    return definition.node;
  }
  const init = definition.type === DefinitionType.Variable ? definition.node.init : undefined;
  return init !== undefined && init !== null && isFunctionNode(init) ? init : undefined;
}

const ITERATION_METHODS = new Set<string>([
  'map',
  'flatMap',
  'forEach',
  'filter',
  'reduce',
  'reduceRight',
  'some',
  'every',
  'find',
  'findIndex',
  'toSorted',
  'sort',
]);

function isIterationCallback(
  identifier: TSESTree.Node,
  call: TSESTree.CallExpression | TSESTree.NewExpression,
): boolean {
  return (
    call.arguments.some((argument) => argument === identifier) &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    ITERATION_METHODS.has(nameOf(call.callee.property) ?? '')
  );
}

const DEFERRING_CALLEES = new Set<string>([
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'requestAnimationFrame',
  'requestIdleCallback',
  'nextTick',
  'on',
  'once',
  'addEventListener',
  'addListener',
  'prependListener',
  'subscribe',
]);

function calleeName(callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(callee.property) : undefined;
}

function isRunByItsCall(fn: TSESTree.Node): boolean {
  const { parent } = fn;
  if (
    parent?.type !== AST_NODE_TYPES.CallExpression ||
    !parent.arguments.some((argument) => argument === fn)
  ) {
    return false;
  }
  if (isIterationCallback(fn, parent)) {
    return true;
  }
  return (
    parent.parent.type !== AST_NODE_TYPES.ExpressionStatement &&
    !DEFERRING_CALLEES.has(calleeName(parent.callee) ?? '')
  );
}

function callingFunction(node: TSESTree.Node, target: TSESTree.Node): TSESTree.Node | undefined {
  const functions = ancestorsOf(node).filter(isFunctionNode);
  return functions.find((fn) => fn === target || !isRunByItsCall(fn)) ?? functions.at(-1);
}

function isCallEdge({ identifier }: TSESLint.Scope.Reference): boolean {
  const { parent } = identifier;
  if (
    parent.type !== AST_NODE_TYPES.CallExpression &&
    parent.type !== AST_NODE_TYPES.NewExpression
  ) {
    return false;
  }
  return parent.callee === identifier || isIterationCallback(identifier, parent);
}

function edgesTo(variable: TSESLint.Scope.Variable): Edge[] {
  const target = variable.defs.map(boundFunction).find((fn) => fn !== undefined);
  if (target === undefined) {
    return [];
  }
  return variable.references.filter(isCallEdge).flatMap(({ identifier }) => {
    const source = callingFunction(identifier, target);
    return source === undefined ? [] : [{ source, target, node: identifier }];
  });
}

function callGraph(sourceCode: SourceCode): Edge[] {
  const scopes = sourceCode.scopeManager?.scopes ?? [];
  return scopes.flatMap((scope) => scope.variables).flatMap(edgesTo);
}

function reachableFrom(start: TSESTree.Node, edges: readonly Edge[]): Set<TSESTree.Node> {
  const seen = new Set<TSESTree.Node>([start]);
  for (const current of seen) {
    for (const edge of edges.filter(({ source }) => source === current)) {
      seen.add(edge.target);
    }
  }
  return seen;
}

function idName(node: TSESTree.Node | undefined): string | undefined {
  return node !== undefined && 'id' in node ? nameOf(node.id) : undefined;
}

function functionName(fn: TSESTree.Node): string | undefined {
  return idName(fn) ?? idName(fn.parent);
}

function callsBack(source: TSESTree.Node, target: TSESTree.Node, edges: readonly Edge[]): boolean {
  return edges.some((edge) => edge.source === target && edge.target === source);
}

function startsCycle({ source, target }: Edge, edges: readonly Edge[]): boolean {
  const closedByNestedCall =
    ancestorsOf(target).includes(source) && callsBack(source, target, edges);
  if (closedByNestedCall || !reachableFrom(target, edges).has(source)) {
    return false;
  }
  const members = [...reachableFrom(source, edges)].filter((member) =>
    reachableFrom(member, edges).has(source),
  );
  return members.every((member) => source.range[0] <= member.range[0]);
}

function recursionReport(
  edge: Edge,
  edges: readonly Edge[],
  messageId: 'recursion' | 'domainRecursion',
): TSESLint.ReportDescriptor<MessageId> | undefined {
  const { source, target, node } = edge;
  if (source === target) {
    return { node, messageId, data: { name: functionName(source) } };
  }
  if (ancestorsOf(source).includes(target) && reachableFrom(target, edges).has(source)) {
    return { node, messageId, data: { name: functionName(target) } };
  }
  if (!startsCycle(edge, edges)) {
    return undefined;
  }
  return {
    node,
    messageId: 'mutualRecursion',
    data: { name: functionName(source), other: functionName(target) },
  };
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow a function that calls itself, directly or through another function',
    },
    schema: [],
    messages: {
      recursion: `'{{name}}' calls itself. Retry or poll: loop with for...of over attempt numbers. Tree walk (directories, AST, JSON): for...of over a worklist, pushing each node's children onto it (for (const node of pending) { pending.push(...children) }). Flat data: map, filter, flatMap or Object.fromEntries. A component that renders itself in JSX is not reported.${EXCEPTION_ROUTE}`,
      domainRecursion: `'{{name}}' calls itself. domain/ has no loops and no recursion, so a walk over data of unknown depth (a tree) belongs in adapters/: for...of over a worklist, pushing each node's children onto it. Pass domain/ the flat result; flat data uses map, filter, flatMap or Object.fromEntries.${EXCEPTION_ROUTE}`,
      mutualRecursion: `'{{name}}' and '{{other}}' call each other. Replace the cycle with a for...of loop over a worklist, or merge them into one function that loops.${EXCEPTION_ROUTE}`,
    },
  },
  create(context) {
    const messageId: 'recursion' | 'domainRecursion' = DOMAIN_PATH.test(
      context.filename.replaceAll('\\', '/'),
    )
      ? 'domainRecursion'
      : 'recursion';

    return {
      'Program:exit'() {
        const edges = callGraph(context.sourceCode);
        for (const edge of edges) {
          const report = recursionReport(edge, edges, messageId);
          if (report !== undefined) {
            context.report(report);
          }
        }
      },
    };
  },
};
