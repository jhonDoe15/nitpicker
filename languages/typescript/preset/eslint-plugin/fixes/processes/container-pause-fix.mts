import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { containsNode } from '../support/nodes.mts';
import { hasCommentIn, replacing, type FixPlan } from '../support/ranges.mts';
import { isDeclared } from '../support/scope.mts';

type PausedWork = {
  readonly subject: string;
  readonly between: readonly TSESTree.Node[];
  readonly range: TSESTree.Range;
};

const DECLARATIONS = new Set<string>([
  AST_NODE_TYPES.VariableDeclaration,
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.ClassDeclaration,
]);
const ESCAPES = new Set<string>([
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.BreakStatement,
  AST_NODE_TYPES.ContinueStatement,
  AST_NODE_TYPES.YieldExpression,
]);

function unpausedSubject(sourceCode: SourceCode, statement: TSESTree.Node): string | undefined {
  if (
    statement.type !== AST_NODE_TYPES.ExpressionStatement ||
    statement.expression.type !== AST_NODE_TYPES.AwaitExpression
  ) {
    return undefined;
  }
  const call = statement.expression.argument;
  if (call.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const { callee } = call;
  const isUnpause =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.name === 'unpause' &&
    call.arguments.length === 0;
  return isUnpause ? sourceCode.getText(callee.object) : undefined;
}

function movesOut(sourceCode: SourceCode, statement: TSESTree.Node): boolean {
  return (
    DECLARATIONS.has(statement.type) ||
    containsNode(sourceCode, statement, {
      matches: (node) =>
        ESCAPES.has(node.type) ||
        (node.type === AST_NODE_TYPES.Identifier && node.name === 'arguments'),
      intoFunctions: false,
    })
  );
}

function pausedWork(sourceCode: SourceCode, call: TSESTree.CallExpression): PausedWork | undefined {
  const statement = call.parent.parent;
  const block = statement?.parent;
  const isAwaited =
    call.parent.type === AST_NODE_TYPES.AwaitExpression &&
    statement?.type === AST_NODE_TYPES.ExpressionStatement &&
    (block?.type === AST_NODE_TYPES.BlockStatement || block?.type === AST_NODE_TYPES.Program);
  if (!isAwaited || call.callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const subject = sourceCode.getText(call.callee.object);
  const body: readonly TSESTree.Node[] = block.body;
  const index = body.indexOf(statement);
  const last = body.findIndex(
    (candidate, position) => position > index && unpausedSubject(sourceCode, candidate) === subject,
  );
  const closing = body[last];
  const between = closing === undefined ? [] : body.slice(index + 1, last);
  const isMovable = between.length > 0 && !between.some((item) => movesOut(sourceCode, item));
  return isMovable && closing !== undefined
    ? { subject, between, range: [statement.range[0], closing.range[1]] }
    : undefined;
}

function workText(sourceCode: SourceCode, between: readonly TSESTree.Node[]): string {
  const start = between[0]?.range[0] ?? 0;
  const lineStart = sourceCode.text.lastIndexOf('\n', start - 1) + 1;
  const isIndented = /^[ \t]*$/u.test(sourceCode.text.slice(lineStart, start));
  return sourceCode.text.slice(isIndented ? lineStart : start, between.at(-1)?.range[1]);
}

export function pauseFix(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): FixPlan | undefined {
  const paused = pausedWork(sourceCode, call);
  if (paused === undefined || !isDeclared(sourceCode, call, 'withPausedContainer')) {
    return undefined;
  }
  if (hasCommentIn(sourceCode, paused.range)) {
    return undefined;
  }
  const work = workText(sourceCode, paused.between);
  return replacing(
    paused.range,
    `await withPausedContainer(${paused.subject}, async () => {\n${work}\n});`,
  );
}
