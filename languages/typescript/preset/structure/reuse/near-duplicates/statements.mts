import type TypeScript from 'typescript';
import { typescriptApi } from '../../../../adapters/typed/typescript-program.mts';
import { NONE, at, on, opaque, optional } from './tree-nodes.mts';
import type { Converted, ConverterTable, TreeContext, TreeNode } from './typed/tree-types.mts';
import { listOf, statementsOf } from './typed/unit-views.mts';

const ts = typescriptApi();

const BLOCK_KIND = 'block';

function blockOf(source: TypeScript.Node, context: TreeContext): Converted {
  return ts.isBlock(source)
    ? context.get(source)
    : at(BLOCK_KIND, source, statementsOf(source, context));
}

function declarationsOf(
  list: TypeScript.VariableDeclarationList,
  context: TreeContext,
): Converted[] {
  return list.declarations.map((declaration) => context.get(declaration));
}

function forPart(source: TypeScript.Node | undefined, context: TreeContext): Converted[] {
  if (source === undefined) {
    return [];
  }
  return ts.isVariableDeclarationList(source)
    ? declarationsOf(source, context)
    : [at('evaluate', source, [context.get(source)])];
}

function labelled(
  kind: string,
  source: TypeScript.BreakStatement | TypeScript.ContinueStatement,
): TreeNode {
  return at({ kind, ...(source.label === undefined ? {} : { value: source.label.text }) }, source);
}

function grouped(value: string, source: TypeScript.Node, children: readonly Converted[]): TreeNode {
  return at({ kind: 'statement', value }, source, children);
}

function caseOf(clause: TypeScript.CaseOrDefaultClause, context: TreeContext): TreeNode {
  const test = ts.isCaseClause(clause) ? context.get(clause.expression) : NONE;
  return grouped('case', clause, [
    test,
    at(BLOCK_KIND, clause, listOf(clause.statements, context)),
  ]);
}

function forOf(source: TypeScript.ForOfStatement, context: TreeContext): TreeNode {
  const target = ts.isVariableDeclarationList(source.initializer)
    ? optional(source.initializer.declarations[0]?.name, context)
    : context.get(source.initializer);
  const parts = [target, context.get(source.expression), blockOf(source.statement, context)];
  return source.awaitModifier === undefined
    ? at('foreach', source, [NONE, ...parts])
    : grouped('for-await', source, parts);
}

function catchOf(clause: TypeScript.CatchClause, context: TreeContext): TreeNode {
  const parameter = clause.variableDeclaration;
  return grouped('catch', clause, [
    parameter === undefined ? NONE : context.get(parameter.name),
    blockOf(clause.block, context),
  ]);
}

const KIND = ts.SyntaxKind;

export const STATEMENTS: ConverterTable = {
  [KIND.Block]: on(ts.isBlock, (source, context) =>
    at(BLOCK_KIND, source, listOf(source.statements, context)),
  ),
  [KIND.VariableStatement]: on(ts.isVariableStatement, (source, context) =>
    declarationsOf(source.declarationList, context),
  ),
  [KIND.VariableDeclaration]: on(ts.isVariableDeclaration, (source, context) =>
    at('declare', source, [
      context.typeOf(source.type),
      context.get(source.name),
      optional(source.initializer, context),
    ]),
  ),
  [KIND.ExpressionStatement]: on(ts.isExpressionStatement, (source, context) =>
    at('evaluate', source, [context.get(source.expression)]),
  ),
  [KIND.IfStatement]: on(ts.isIfStatement, (source, context) =>
    at('if', source, [
      context.get(source.expression),
      blockOf(source.thenStatement, context),
      source.elseStatement === undefined ? NONE : blockOf(source.elseStatement, context),
    ]),
  ),
  [KIND.ReturnStatement]: on(ts.isReturnStatement, (source, context) =>
    at('return', source, [optional(source.expression, context)]),
  ),
  [KIND.ThrowStatement]: on(ts.isThrowStatement, (source, context) =>
    at('throw', source, [context.get(source.expression)]),
  ),
  [KIND.BreakStatement]: on(ts.isBreakStatement, (source) => labelled('break', source)),
  [KIND.ContinueStatement]: on(ts.isContinueStatement, (source) => labelled('continue', source)),
  [KIND.ForStatement]: on(ts.isForStatement, (source, context) =>
    at('for', source, [
      at(BLOCK_KIND, source, forPart(source.initializer, context)),
      optional(source.condition, context),
      at(BLOCK_KIND, source, forPart(source.incrementor, context)),
      blockOf(source.statement, context),
    ]),
  ),
  [KIND.ForOfStatement]: on(ts.isForOfStatement, forOf),
  [KIND.ForInStatement]: on(ts.isForInStatement, (source, context) =>
    grouped('for-in', source, [
      ...forPart(source.initializer, context),
      context.get(source.expression),
      blockOf(source.statement, context),
    ]),
  ),
  [KIND.WhileStatement]: on(ts.isWhileStatement, (source, context) =>
    at('while', source, [context.get(source.expression), blockOf(source.statement, context)]),
  ),
  [KIND.DoStatement]: on(ts.isDoStatement, (source, context) =>
    at('do', source, [blockOf(source.statement, context), context.get(source.expression)]),
  ),
  [KIND.SwitchStatement]: on(ts.isSwitchStatement, (source, context) =>
    grouped('switch', source, [
      context.get(source.expression),
      ...source.caseBlock.clauses.map((clause) => caseOf(clause, context)),
    ]),
  ),
  [KIND.TryStatement]: on(ts.isTryStatement, (source, context) =>
    grouped('try', source, [
      blockOf(source.tryBlock, context),
      source.catchClause === undefined ? NONE : catchOf(source.catchClause, context),
      source.finallyBlock === undefined ? NONE : blockOf(source.finallyBlock, context),
    ]),
  ),
  [KIND.LabeledStatement]: on(ts.isLabeledStatement, (source, context) =>
    grouped(`label:${source.label.text}`, source, [blockOf(source.statement, context)]),
  ),
  [KIND.EmptyStatement]: () => [],
  [KIND.FunctionDeclaration]: on(ts.isFunctionDeclaration, (source, context) =>
    source.body === undefined
      ? []
      : at('declare', source, [
          NONE,
          context.name(source.name?.text ?? 'default', source),
          context.lambda(source),
        ]),
  ),
  [KIND.ClassDeclaration]: (source, context) => opaque('statement', source, context),
};
