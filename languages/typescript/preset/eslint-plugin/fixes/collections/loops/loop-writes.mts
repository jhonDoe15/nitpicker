import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { LOOP_TYPES } from '../../../rules/collections/spread-shapes.mts';
import { ancestorsOf, contains } from '../../../rules/typed/node-views.mts';

type Variable = TSESLint.Scope.Variable;
type Reference = TSESLint.Scope.Reference;
export type Write = {
  readonly statement: TSESTree.ExpressionStatement;
  readonly assignment: TSESTree.AssignmentExpression;
  readonly lead: TSESTree.Identifier;
  readonly tail: readonly TSESTree.Node[];
};
export type Accumulation = {
  readonly writes: readonly Write[];
  readonly reads: readonly Reference[];
  readonly loops: readonly TSESTree.Node[];
};

function writeOf(variable: Variable, reference: Reference): Write | undefined {
  const assignment = reference.identifier.parent;
  if (
    assignment.type !== AST_NODE_TYPES.AssignmentExpression ||
    assignment.operator !== '=' ||
    assignment.left !== reference.identifier ||
    assignment.parent.type !== AST_NODE_TYPES.ExpressionStatement ||
    assignment.right.type !== AST_NODE_TYPES.ArrayExpression
  ) {
    return undefined;
  }
  const [lead, ...tail] = assignment.right.elements;
  const target = lead?.type === AST_NODE_TYPES.SpreadElement ? lead.argument : undefined;
  const present = tail.filter((element) => element !== null);
  const isSelf =
    target?.type === AST_NODE_TYPES.Identifier &&
    variable.references.some((candidate) => candidate.identifier === target);
  return isSelf && present.length === tail.length && present.length > 0
    ? { statement: assignment.parent, assignment, lead: target, tail: present }
    : undefined;
}

export function outerLoop(
  node: TSESTree.Node,
  declaration: TSESTree.Node,
): TSESTree.Node | undefined {
  return ancestorsOf(node)
    .filter((ancestor) => LOOP_TYPES.has(ancestor.type) && !contains(ancestor, declaration))
    .at(-1);
}

export function accumulationOf(
  variable: Variable,
  declaration: TSESTree.Node,
): Accumulation | undefined {
  const writes: Write[] = [];
  const reads: Reference[] = [];
  for (const reference of variable.references) {
    if (reference.init === true) {
      continue;
    }
    const write = reference.isWrite() ? writeOf(variable, reference) : undefined;
    if (reference.isWrite() && write === undefined) {
      return undefined;
    }
    if (write !== undefined) {
      writes.push(write);
    } else if (reference.from.variableScope === variable.scope.variableScope) {
      reads.push(reference);
    } else {
      return undefined;
    }
  }
  const loops = writes.map(({ statement }) => outerLoop(statement, declaration));
  const found = loops.filter((loop) => loop !== undefined);
  const leads = new Set<TSESTree.Node>(writes.map(({ lead }) => lead));
  return writes.length > 0 && found.length === loops.length
    ? { writes, reads: reads.filter(({ identifier }) => !leads.has(identifier)), loops: found }
    : undefined;
}
