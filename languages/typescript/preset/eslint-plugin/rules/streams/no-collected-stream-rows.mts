import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  ancestorsOf,
  contains,
  depthFirst,
  nameOf,
  nodeChildren,
  variableNamed,
  type SourceCode,
} from '../typed/node-views.mts';
import { isStreamSource, unwrapped } from './stream-sources.mts';

type Reference = TSESLint.Scope.Reference;
type Variable = TSESLint.Scope.Variable;
type Identifier = TSESTree.Identifier | TSESTree.JSXIdentifier;
type Exit = TSESTree.ReturnStatement | TSESTree.BreakStatement;

const { DefinitionType } = TSESLint.Scope;
const FUNCTIONS = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);
const APPENDS = new Set<string>(['push', 'unshift']);
const BREAK_TARGETS = new Set<string>([
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.SwitchStatement,
]);
const DRAINS = new Set<string>(['splice', 'pop', 'shift']);
const ASSEMBLERS = new Set<string>(['concat', 'join']);
const ASSEMBLER_TYPES = new Set<string>(['Blob', 'Buffer', 'File', 'Uint8Array']);

const MESSAGE =
  '`{{name}}` collects every item of this stream, generator or cursor and is used only after the loop, so the whole result is held in memory at once, which is what streaming avoids and what runs out of memory on a large input. Flush a fixed-size batch inside the loop (`if (batch.length >= 500) { await save(batch.splice(0)); }`) and the rest once after it. An exception fits only for a source that always stays small.';

function identifiersIn(node: TSESTree.Node): TSESTree.Identifier[] {
  return [...depthFirst(node, nodeChildren)].filter(
    (child) => child.type === AST_NODE_TYPES.Identifier,
  );
}

function exitsIn(node: TSESTree.Node): Exit[] {
  return [...depthFirst(node, nodeChildren)].filter(
    (child) =>
      child.type === AST_NODE_TYPES.ReturnStatement || child.type === AST_NODE_TYPES.BreakStatement,
  );
}

function memberCall(identifier: Identifier):
  | {
      readonly name: string | undefined;
      readonly member: TSESTree.MemberExpression;
      readonly call: TSESTree.CallExpression | undefined;
    }
  | undefined {
  const member = identifier.parent;
  if (
    member.type !== AST_NODE_TYPES.MemberExpression ||
    member.object !== identifier ||
    member.computed
  ) {
    return undefined;
  }
  const call = member.parent;
  const name = nameOf(member.property);
  return {
    name,
    member,
    call: call.type === AST_NODE_TYPES.CallExpression && call.callee === member ? call : undefined,
  };
}

function ownLoopCode(node: TSESTree.Node, loop: TSESTree.Node): boolean {
  return ancestorsOf(node)
    .slice(0, ancestorsOf(node).indexOf(loop))
    .every((ancestor) => !FUNCTIONS.has(ancestor.type));
}

function exitsLoop(statement: Exit, loop: TSESTree.Node): boolean {
  if (statement.type === AST_NODE_TYPES.ReturnStatement) {
    return true;
  }
  const target = ancestorsOf(statement).find((ancestor) => BREAK_TARGETS.has(ancestor.type));
  return statement.label !== null || target === loop;
}

function exitsEarly(loop: TSESTree.ForOfStatement): boolean {
  return exitsIn(loop.body).some(
    (statement) => ownLoopCode(statement, loop) && exitsLoop(statement, loop),
  );
}

function isArrayLiteral(init: TSESTree.Node | undefined): boolean {
  const value = init === undefined ? undefined : unwrapped(init);
  return value?.type === AST_NODE_TYPES.ArrayExpression;
}

function isSpreadAppend(identifier: Identifier, name: string): boolean {
  const assignment = identifier.parent;
  const value =
    assignment.type === AST_NODE_TYPES.AssignmentExpression
      ? unwrapped(assignment.right)
      : undefined;
  return (
    value?.type === AST_NODE_TYPES.ArrayExpression &&
    value.elements.some(
      (element) =>
        element?.type === AST_NODE_TYPES.SpreadElement &&
        nameOf(unwrapped(element.argument)) === name,
    )
  );
}

function isDrain(reference: Reference, name: string): boolean {
  const { identifier } = reference;
  if (reference.isWrite()) {
    return !isSpreadAppend(identifier, name);
  }
  const use = memberCall(identifier);
  if (use?.call !== undefined) {
    return DRAINS.has(use.name ?? '');
  }
  const assignment = use?.member.parent;
  return (
    use?.name === 'length' &&
    assignment?.type === AST_NODE_TYPES.AssignmentExpression &&
    assignment.left === use.member
  );
}

function isAppend(reference: Reference): boolean {
  return !reference.isWrite() && APPENDS.has(memberCall(reference.identifier)?.name ?? '');
}

function assemblesBytes(identifier: Identifier): boolean {
  const use = memberCall(identifier);
  if (use !== undefined && ASSEMBLERS.has(use.name ?? '') && use.call !== undefined) {
    return true;
  }
  const call = identifier.parent;
  if (
    (call.type !== AST_NODE_TYPES.CallExpression && call.type !== AST_NODE_TYPES.NewExpression) ||
    !call.arguments.some((argument) => argument === identifier)
  ) {
    return false;
  }
  const callee = unwrapped(call.callee);
  const owner = callee.type === AST_NODE_TYPES.MemberExpression ? unwrapped(callee.object) : callee;
  return owner.type === AST_NODE_TYPES.Identifier && ASSEMBLER_TYPES.has(owner.name);
}

function collectedArray(
  sourceCode: SourceCode,
  loop: TSESTree.ForOfStatement,
  reference: Reference,
): Variable | undefined {
  const { identifier } = reference;
  const variable = variableNamed(sourceCode, identifier);
  const definition = variable?.defs[0];
  if (
    variable === undefined ||
    definition?.type !== DefinitionType.Variable ||
    contains(loop, definition.node) ||
    !isArrayLiteral(definition.node.init ?? undefined)
  ) {
    return undefined;
  }
  const references = variable.references.filter((candidate) => !candidate.init);
  const inLoop = references.filter((candidate) => contains(loop, candidate.identifier));
  const after = references.filter((candidate) => candidate.identifier.range[0] > loop.range[1]);
  if (inLoop.some((candidate) => isDrain(candidate, identifier.name)) || after.length === 0) {
    return undefined;
  }
  return after.some((candidate) => assemblesBytes(candidate.identifier)) ? undefined : variable;
}

export const rule: TSESLint.RuleModule<'collectedStream'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow collecting every item of a stream, generator or cursor into one array that is used only after the loop',
    },
    schema: [],
    messages: { collectedStream: MESSAGE },
  },
  create(context) {
    const { sourceCode } = context;
    function appendedArray(
      loop: TSESTree.ForOfStatement,
      identifier: TSESTree.Identifier,
    ): Variable | undefined {
      const variable = variableNamed(sourceCode, identifier);
      const reference = variable?.references.find(
        (candidate) => candidate.identifier === identifier,
      );
      const appends =
        reference !== undefined && ownLoopCode(identifier, loop) && isAppend(reference);
      return appends ? collectedArray(sourceCode, loop, reference) : undefined;
    }
    return {
      'ForOfStatement[await=true]'(loop: TSESTree.ForOfStatement) {
        if (!isStreamSource(sourceCode, loop.right) || exitsEarly(loop)) {
          return;
        }
        const firstAppends = new Map<Variable, TSESTree.Identifier>();
        for (const identifier of identifiersIn(loop.body)) {
          const variable = appendedArray(loop, identifier);
          if (variable !== undefined && !firstAppends.has(variable)) {
            firstAppends.set(variable, identifier);
          }
        }
        for (const identifier of firstAppends.values()) {
          context.report({
            node: identifier,
            messageId: 'collectedStream',
            data: { name: identifier.name },
          });
        }
      },
    };
  },
};
