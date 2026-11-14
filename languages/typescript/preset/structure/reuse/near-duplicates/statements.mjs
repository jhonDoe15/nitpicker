import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { listOf, statementsOf } from '../../../../../../shared/near-duplicates/unit-parts.mjs';
import { NONE, at, opaque, optional } from './tree-nodes.mjs';

const BLOCK_KIND = 'block';

function blockOf(source, context) {
  return ts.isBlock(source)
    ? context.get(source)
    : at(BLOCK_KIND, source, statementsOf(source, context));
}

function declarationsOf(list, context) {
  return list.declarations.map((declaration) => context.get(declaration));
}

function forPart(source, context) {
  if (source === undefined) {
    return [];
  }
  return ts.isVariableDeclarationList(source)
    ? declarationsOf(source, context)
    : [at('evaluate', source, [context.get(source)])];
}

function labelled(kind, source) {
  return at({ kind, ...(source.label === undefined ? {} : { value: source.label.text }) }, source);
}

function grouped(value, source, children) {
  return at({ kind: 'statement', value }, source, children);
}

function caseOf(clause, context) {
  const test = ts.isCaseClause(clause) ? context.get(clause.expression) : NONE;
  return grouped('case', clause, [
    test,
    at(BLOCK_KIND, clause, listOf(clause.statements, context)),
  ]);
}

function forOf(source, context) {
  const target = ts.isVariableDeclarationList(source.initializer)
    ? context.get(source.initializer.declarations[0].name)
    : context.get(source.initializer);
  const parts = [target, context.get(source.expression), blockOf(source.statement, context)];
  return source.awaitModifier === undefined
    ? at('foreach', source, [NONE, ...parts])
    : grouped('for-await', source, parts);
}

function catchOf(clause, context) {
  const parameter = clause.variableDeclaration;
  return grouped('catch', clause, [
    parameter === undefined ? NONE : context.get(parameter.name),
    blockOf(clause.block, context),
  ]);
}

const KIND = ts.SyntaxKind;

export const STATEMENTS = {
  [KIND.Block]: (source, context) => at(BLOCK_KIND, source, listOf(source.statements, context)),
  [KIND.VariableStatement]: (source, context) => declarationsOf(source.declarationList, context),
  [KIND.VariableDeclaration]: (source, context) =>
    at('declare', source, [
      context.typeOf(source.type),
      context.get(source.name),
      optional(source.initializer, context),
    ]),
  [KIND.ExpressionStatement]: (source, context) =>
    at('evaluate', source, [context.get(source.expression)]),
  [KIND.IfStatement]: (source, context) =>
    at('if', source, [
      context.get(source.expression),
      blockOf(source.thenStatement, context),
      source.elseStatement === undefined ? NONE : blockOf(source.elseStatement, context),
    ]),
  [KIND.ReturnStatement]: (source, context) =>
    at('return', source, [optional(source.expression, context)]),
  [KIND.ThrowStatement]: (source, context) => at('throw', source, [context.get(source.expression)]),
  [KIND.BreakStatement]: (source) => labelled('break', source),
  [KIND.ContinueStatement]: (source) => labelled('continue', source),
  [KIND.ForStatement]: (source, context) =>
    at('for', source, [
      at(BLOCK_KIND, source, forPart(source.initializer, context)),
      optional(source.condition, context),
      at(BLOCK_KIND, source, forPart(source.incrementor, context)),
      blockOf(source.statement, context),
    ]),
  [KIND.ForOfStatement]: forOf,
  [KIND.ForInStatement]: (source, context) =>
    grouped('for-in', source, [
      ...forPart(source.initializer, context),
      context.get(source.expression),
      blockOf(source.statement, context),
    ]),
  [KIND.WhileStatement]: (source, context) =>
    at('while', source, [context.get(source.expression), blockOf(source.statement, context)]),
  [KIND.DoStatement]: (source, context) =>
    at('do', source, [blockOf(source.statement, context), context.get(source.expression)]),
  [KIND.SwitchStatement]: (source, context) =>
    grouped('switch', source, [
      context.get(source.expression),
      ...source.caseBlock.clauses.map((clause) => caseOf(clause, context)),
    ]),
  [KIND.TryStatement]: (source, context) =>
    grouped('try', source, [
      blockOf(source.tryBlock, context),
      source.catchClause === undefined ? NONE : catchOf(source.catchClause, context),
      source.finallyBlock === undefined ? NONE : blockOf(source.finallyBlock, context),
    ]),
  [KIND.LabeledStatement]: (source, context) =>
    grouped(`label:${source.label.text}`, source, [blockOf(source.statement, context)]),
  [KIND.EmptyStatement]: () => [],
  [KIND.FunctionDeclaration]: (source, context) =>
    source.body === undefined
      ? []
      : at('declare', source, [
          NONE,
          context.name(source.name.text, source),
          context.lambda(source),
        ]),
  [KIND.ClassDeclaration]: (source, context) => opaque('statement', source, context),
};
