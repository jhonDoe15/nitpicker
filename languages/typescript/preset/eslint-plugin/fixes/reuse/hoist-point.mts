import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { inserting, type FixPlan } from '../support/ranges.mts';

function isDirective(statement: TSESTree.Node): boolean {
  return statement.type === AST_NODE_TYPES.ExpressionStatement && statement.directive !== undefined;
}

function isImport(statement: TSESTree.Node): boolean {
  return statement.type === AST_NODE_TYPES.ImportDeclaration;
}

function afterStatement(
  sourceCode: SourceCode,
  program: TSESTree.Program,
  { index, text }: { readonly index: number; readonly text: string },
): FixPlan | undefined {
  const last = program.body[index];
  if (last === undefined) {
    return undefined;
  }
  const trailing = sourceCode
    .getCommentsAfter(last)
    .some((comment) => comment.loc.start.line === last.loc.end.line);
  const prefix = program.body.slice(0, index + 1);
  if (trailing || !prefix.every((statement) => isImport(statement) || isDirective(statement))) {
    return undefined;
  }
  return inserting(last.range[1], `\n\n${text}`);
}

function beforeFirst(
  sourceCode: SourceCode,
  first: TSESTree.Node,
  text: string,
): FixPlan | undefined {
  const touching = sourceCode
    .getCommentsBefore(first)
    .some((comment) => comment.loc.end.line >= first.loc.start.line - 1);
  return touching ? undefined : inserting(first.range[0], `${text}\n\n`);
}

export function insertingAtModuleTop(
  sourceCode: SourceCode,
  program: TSESTree.Program,
  text: string,
): FixPlan | undefined {
  const anchor = Math.max(
    program.body.findLastIndex((statement) => isImport(statement)),
    program.body.findLastIndex((statement) => isDirective(statement)),
  );
  if (anchor >= 0) {
    return afterStatement(sourceCode, program, { index: anchor, text });
  }
  const [first] = program.body;
  return first === undefined ? undefined : beforeFirst(sourceCode, first, text);
}
