import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { methodCallTarget, subtreeNodes, targetNameOf } from './cache-ops.mts';

export type RecursionGuard = {
  readonly name: string;
  readonly entryPos: number | undefined;
  readonly ifNode: TSESTree.IfStatement;
  readonly flagNames: ReadonlySet<string>;
};

const SET_CHECK = new Set<string>(['has']);
const SET_ENTRY = new Set<string>(['add']);
const STACK_CHECK = new Set<string>(['includes']);
const STACK_ENTRY = new Set<string>(['push']);
const COMPARISON_OPS = new Set<string>(['>', '>=', '<', '<=', '===']);
const STEP_ASSIGN_OPS = new Set<string>(['+=', '-=']);
const STEP_BIN_OPS = new Set<string>(['+', '-']);
const GUARD_STACK_NAME = /(?:inProgress|visiting|active|seen|visited|stack|pending|resolving)/iu;
const COUNTER_NAME = /(?:depth|turn|level|limit|budget|remaining|hops|steps|nesting|recurs)/iu;

function hasEarlyReturn(statement: TSESTree.Statement): boolean {
  return subtreeNodes(statement).some((node) => node.type === AST_NODE_TYPES.ReturnStatement);
}

function assignedFlagsIn(statement: TSESTree.Statement): Set<string> {
  const flags = new Set<string>();
  for (const node of subtreeNodes(statement)) {
    if (node.type !== AST_NODE_TYPES.AssignmentExpression) {
      continue;
    }
    const name = targetNameOf(node.left);
    if (name !== undefined) {
      flags.add(name);
    }
  }
  return flags;
}

function earliestMethodPos(
  nodes: readonly TSESTree.Node[],
  target: string,
  methods: ReadonlySet<string>,
): number | undefined {
  for (const node of nodes) {
    if (methodCallTarget(node, methods) === target) {
      return node.range[0];
    }
  }
  return undefined;
}

function setGuardCandidate(
  test: TSESTree.Expression,
  cacheTargets: ReadonlySet<string>,
): { readonly name: string; readonly entryMethods: ReadonlySet<string> } | undefined {
  for (const node of subtreeNodes(test)) {
    const setTarget = methodCallTarget(node, SET_CHECK);
    if (setTarget !== undefined && !cacheTargets.has(setTarget)) {
      return { name: setTarget, entryMethods: SET_ENTRY };
    }
    const stackTarget = methodCallTarget(node, STACK_CHECK);
    if (
      stackTarget !== undefined &&
      !cacheTargets.has(stackTarget) &&
      GUARD_STACK_NAME.test(stackTarget)
    ) {
      return { name: stackTarget, entryMethods: STACK_ENTRY };
    }
  }
  return undefined;
}

function isCounterMutation(node: TSESTree.Node, name: string): boolean {
  if (node.type === AST_NODE_TYPES.UpdateExpression) {
    return targetNameOf(node.argument) === name;
  }
  return (
    node.type === AST_NODE_TYPES.AssignmentExpression &&
    STEP_ASSIGN_OPS.has(node.operator) &&
    targetNameOf(node.left) === name
  );
}

function isCounterStep(node: TSESTree.Node, name: string): boolean {
  if (isCounterMutation(node, name)) {
    return true;
  }
  return (
    node.type === AST_NODE_TYPES.BinaryExpression &&
    STEP_BIN_OPS.has(node.operator) &&
    (targetNameOf(node.left) === name || targetNameOf(node.right) === name)
  );
}

function counterEntryPos(nodes: readonly TSESTree.Node[], name: string): number | undefined {
  for (const node of nodes) {
    if (isCounterMutation(node, name)) {
      return node.range[0];
    }
  }
  return undefined;
}

function counterCandidatesOf(
  test: TSESTree.Expression,
  cacheTargets: ReadonlySet<string>,
): string[] {
  const names: string[] = [];
  for (const node of subtreeNodes(test)) {
    if (node.type !== AST_NODE_TYPES.BinaryExpression || !COMPARISON_OPS.has(node.operator)) {
      continue;
    }
    const left = targetNameOf(node.left);
    const right = targetNameOf(node.right);
    if (left !== undefined && !cacheTargets.has(left) && COUNTER_NAME.test(left)) {
      names.push(left);
    }
    if (right !== undefined && !cacheTargets.has(right) && COUNTER_NAME.test(right)) {
      names.push(right);
    }
  }
  return names;
}

function guardFromIf(
  ifStmt: TSESTree.IfStatement,
  nodes: readonly TSESTree.Node[],
  cacheTargets: ReadonlySet<string>,
): RecursionGuard | undefined {
  if (!hasEarlyReturn(ifStmt.consequent)) {
    return undefined;
  }
  const setCandidate = setGuardCandidate(ifStmt.test, cacheTargets);
  if (setCandidate !== undefined) {
    const entryPos = earliestMethodPos(nodes, setCandidate.name, setCandidate.entryMethods);
    return entryPos === undefined
      ? undefined
      : {
          name: setCandidate.name,
          entryPos,
          ifNode: ifStmt,
          flagNames: assignedFlagsIn(ifStmt.consequent),
        };
  }
  for (const counter of counterCandidatesOf(ifStmt.test, cacheTargets)) {
    if (nodes.some((node) => isCounterStep(node, counter))) {
      return {
        name: counter,
        entryPos: counterEntryPos(nodes, counter),
        ifNode: ifStmt,
        flagNames: assignedFlagsIn(ifStmt.consequent),
      };
    }
  }
  return undefined;
}

export function findRecursionGuard(
  nodes: readonly TSESTree.Node[],
  cacheTargets: ReadonlySet<string>,
): RecursionGuard | undefined {
  for (const node of nodes) {
    if (node.type !== AST_NODE_TYPES.IfStatement) {
      continue;
    }
    const guard = guardFromIf(node, nodes, cacheTargets);
    if (guard !== undefined) {
      return guard;
    }
  }
  return undefined;
}
