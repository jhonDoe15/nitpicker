import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf } from '../typed/node-views.mts';
import {
  calledKey,
  descendants,
  enclosingOwner,
  fileCalls,
  methodCall,
  type FileCalls,
  type FileFunction,
} from '../recursion/graph/file-calls.mts';
import { worklistOf, type Worklist } from './worklist-loops.mts';

type MessageIds = 'shrinkingJoin';
type Join = { readonly call: TSESTree.CallExpression; readonly state: string };
type Scope = { readonly body: TSESTree.Node; readonly sources: ReadonlySet<string> };

const JOIN_NAME = /^(?:join|merge|union|meet|widen)/iu;
const REMOVALS = new Set(['delete', 'clear', 'splice']);

function calleeName(call: TSESTree.CallExpression): string | undefined {
  const { callee } = call;
  return callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(callee.property) : nameOf(callee);
}

function memberName(node: TSESTree.Node): string | undefined {
  return node.type === AST_NODE_TYPES.MemberExpression &&
    node.object.type === AST_NODE_TYPES.ThisExpression
    ? nameOf(node.property)
    : nameOf(node);
}

function stateOf(node: TSESTree.Node, key: string): string | undefined {
  if (node.type === AST_NODE_TYPES.MemberExpression && node.computed) {
    return nameOf(node.property) === key ? memberName(node.object) : undefined;
  }
  const call = methodCall(node);
  return call?.method === 'get' &&
    node.type === AST_NODE_TYPES.CallExpression &&
    nameOf(node.arguments[0]) === key
    ? call.receiver
    : undefined;
}

function joinAt(node: TSESTree.Node, key: string): Join | undefined {
  if (node.type !== AST_NODE_TYPES.CallExpression || !JOIN_NAME.test(calleeName(node) ?? '')) {
    return undefined;
  }
  const parts = [...node.arguments, node.callee].flatMap((part): TSESTree.Node[] =>
    part.type === AST_NODE_TYPES.MemberExpression ? [part, part.object] : [part],
  );
  const state = parts.map((part) => stateOf(part, key)).find((name) => name !== undefined);
  return state === undefined ? undefined : { call: node, state };
}

function joinIn(test: TSESTree.Node, key: string): Join | undefined {
  return descendants(test)
    .map((node) => joinAt(node, key))
    .find((join) => join !== undefined);
}

function guardingIf(
  push: TSESTree.CallExpression,
  loop: TSESTree.Node,
): TSESTree.IfStatement | undefined {
  const path = [push, ...ancestorsOf(push)];
  const inside = path.slice(0, path.indexOf(loop));
  return inside.find(
    (node, index): node is TSESTree.IfStatement =>
      node.type === AST_NODE_TYPES.IfStatement &&
      index > 0 &&
      node.consequent === inside[index - 1],
  );
}

function joins(worklist: Worklist): Join[] {
  return worklist.pushes.flatMap((push) => {
    const key = nameOf(push.arguments[0]);
    const branch = guardingIf(push, worklist.loop);
    const join = key === undefined || branch === undefined ? undefined : joinIn(branch.test, key);
    return join === undefined ? [] : [join];
  });
}

function mentions(node: TSESTree.Node, names: ReadonlySet<string>): boolean {
  return descendants(node).some((part) => names.has(memberName(part) ?? ''));
}

function copies(scope: Scope): Set<string> {
  return new Set(
    descendants(scope.body).flatMap((node) =>
      node.type === AST_NODE_TYPES.VariableDeclarator &&
      node.init !== null &&
      mentions(node.init, scope.sources)
        ? (nameOf(node.id) ?? [])
        : [],
    ),
  );
}

function boundIterable(argument: TSESTree.Node, body: TSESTree.Node): TSESTree.Node | undefined {
  const name = nameOf(argument);
  return descendants(body).find(
    (node): node is TSESTree.ForOfStatement =>
      node.type === AST_NODE_TYPES.ForOfStatement &&
      name !== undefined &&
      descendants(node.left).some((part) => nameOf(part) === name),
  )?.right;
}

function dependsOnFacts(
  argument: TSESTree.Node | undefined,
  body: TSESTree.Node,
  facts: ReadonlySet<string>,
): boolean {
  if (argument === undefined) {
    return true;
  }
  const iterable = boundIterable(argument, body);
  return mentions(argument, facts) || (iterable !== undefined && mentions(iterable, facts));
}

function removesFacts(scope: Scope): boolean {
  const copied = copies(scope);
  const facts = new Set([...copied, ...scope.sources]);
  return descendants(scope.body).some((node) => {
    if (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === 'delete') {
      const target = node.argument;
      return (
        target.type === AST_NODE_TYPES.MemberExpression &&
        copied.has(memberName(target.object) ?? '') &&
        dependsOnFacts(target.property, scope.body, facts)
      );
    }
    const call = methodCall(node);
    return (
      call !== undefined &&
      node.type === AST_NODE_TYPES.CallExpression &&
      REMOVALS.has(call.method) &&
      copied.has(call.receiver) &&
      dependsOnFacts(node.arguments[0], scope.body, facts)
    );
  });
}

function stateParams(call: TSESTree.CallExpression, fn: FileFunction, state: string): Set<string> {
  const names = new Set([state]);
  for (const [index, param] of fn.node.params.entries()) {
    const argument = call.arguments[index];
    const name = nameOf(param);
    if (argument !== undefined && name !== undefined && mentions(argument, names)) {
      names.add(name);
    }
  }
  return names;
}

function transferRemoves(worklist: Worklist, state: string, graph: FileCalls): boolean {
  const owner = enclosingOwner(worklist.loop);
  const called = descendants(worklist.loop.body).flatMap((node) => {
    const key = node.type === AST_NODE_TYPES.CallExpression ? calledKey(node, owner) : undefined;
    const fn = key === undefined ? undefined : graph.functions.get(key);
    return fn === undefined || node.type !== AST_NODE_TYPES.CallExpression
      ? []
      : [{ body: fn.node, sources: stateParams(node, fn, state) }];
  });
  return [{ body: worklist.loop.body, sources: new Set([state]) }, ...called].some(removesFacts);
}

export const rule: TSESLint.RuleModule<MessageIds> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a worklist pass that joins into a stored state while the transfer can take facts back',
    },
    schema: [],
    messages: {
      shrinkingJoin:
        "This worklist pass joins each block's output into the stored input of its successor, but the transfer removes facts depending on the facts it was given. A join never takes back what an earlier pass sent along the same edge, so the successor keeps an old, stronger fact after the loop comes round with a weaker one, and the pass reports results that are not true. Store the last output per edge and recompute a block's input from all of them whenever one changes, or make the transfer only add facts.",
    },
  },
  create(context) {
    const loops: Worklist[] = [];
    return {
      'ForOfStatement, WhileStatement'(node: TSESTree.ForOfStatement | TSESTree.WhileStatement) {
        const worklist = worklistOf(node);
        if (worklist !== undefined) {
          loops.push(worklist);
        }
      },
      'Program:exit'(program: TSESTree.Program) {
        const graph = fileCalls(program);
        const found = loops.flatMap((worklist) =>
          joins(worklist).filter((join) => transferRemoves(worklist, join.state, graph)),
        );
        for (const join of found) {
          context.report({ node: join.call, messageId: 'shrinkingJoin' });
        }
      },
    };
  },
};
