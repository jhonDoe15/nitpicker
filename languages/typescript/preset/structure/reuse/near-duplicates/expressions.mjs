import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { NONE, at, opaque, optional, textOf } from './tree-nodes.mjs';

const KIND = ts.SyntaxKind;

const ASSIGNMENTS = new Set([
  KIND.EqualsToken,
  KIND.PlusEqualsToken,
  KIND.MinusEqualsToken,
  KIND.AsteriskEqualsToken,
  KIND.AsteriskAsteriskEqualsToken,
  KIND.SlashEqualsToken,
  KIND.PercentEqualsToken,
  KIND.LessThanLessThanEqualsToken,
  KIND.GreaterThanGreaterThanEqualsToken,
  KIND.GreaterThanGreaterThanGreaterThanEqualsToken,
  KIND.AmpersandEqualsToken,
  KIND.BarEqualsToken,
  KIND.CaretEqualsToken,
  KIND.AmpersandAmpersandEqualsToken,
  KIND.BarBarEqualsToken,
  KIND.QuestionQuestionEqualsToken,
]);

function literal(kind, value) {
  return (source) => at({ kind: 'literal', literal: kind, value: value(source) }, source);
}

function quoted(source) {
  return JSON.stringify(source.text);
}

function binaryOf(source, context) {
  const operator = ts.tokenToString(source.operatorToken.kind);
  const children = [context.get(source.left), context.get(source.right)];
  if (source.operatorToken.kind === KIND.CommaToken) {
    return at({ kind: 'expression', value: 'comma' }, source, children);
  }
  const kind = ASSIGNMENTS.has(source.operatorToken.kind) ? 'assign' : 'binary';
  return at({ kind, value: operator }, source, children);
}

function prefixOf(source, context) {
  const operator = ts.tokenToString(source.operator);
  const isUpdate = operator === '++' || operator === '--';
  return isUpdate
    ? at({ kind: 'update', value: `prefix${operator}` }, source, [context.get(source.operand)])
    : at({ kind: 'unary', value: operator }, source, [context.get(source.operand)]);
}

function unaryOf(operator) {
  return (source, context) =>
    at({ kind: 'unary', value: operator }, source, [context.get(source.expression)]);
}

function callOf(source, context) {
  const children = [context.get(source.expression), ...source.arguments.map(context.get)];
  return source.questionDotToken === undefined
    ? at('call', source, children)
    : at({ kind: 'expression', value: 'optional-call' }, source, children);
}

function memberOf(source, context) {
  const optionalChain = source.questionDotToken === undefined ? '' : '?.';
  return at({ kind: 'member', value: `${optionalChain}${source.name.text}` }, source, [
    context.get(source.expression),
  ]);
}

function indexOf(source, context) {
  const children = [context.get(source.expression), context.get(source.argumentExpression)];
  return source.questionDotToken === undefined
    ? at('index', source, children)
    : at({ kind: 'expression', value: 'optional-index' }, source, children);
}

function newOf(source, context) {
  const type = at({ kind: 'type', value: textOf(source.expression, context) }, source.expression);
  return at('new', source, [type, ...(source.arguments ?? []).map(context.get)]);
}

function wrapped(source, context) {
  return context.get(source.expression);
}

function grouped(value) {
  return (source, context) =>
    at({ kind: 'expression', value }, source, [optional(source.expression, context)]);
}

export const EXPRESSIONS = {
  [KIND.Identifier]: (source, context) => context.name(source.text, source),
  [KIND.StringLiteral]: literal('string', quoted),
  [KIND.NoSubstitutionTemplateLiteral]: literal('string', quoted),
  [KIND.NumericLiteral]: literal('number', (source) => String(Number(source.text))),
  [KIND.BigIntLiteral]: literal('bigint', (source) => source.text),
  [KIND.RegularExpressionLiteral]: literal('regexp', (source) => source.text),
  [KIND.TrueKeyword]: literal('boolean', () => 'true'),
  [KIND.FalseKeyword]: literal('boolean', () => 'false'),
  [KIND.NullKeyword]: literal('null', () => 'null'),
  [KIND.ThisKeyword]: (source) => at('this', source),
  [KIND.SuperKeyword]: (source, context) => context.name('super', source),
  [KIND.ImportKeyword]: (source, context) => context.name('import', source),
  [KIND.BinaryExpression]: binaryOf,
  [KIND.PrefixUnaryExpression]: prefixOf,
  [KIND.PostfixUnaryExpression]: (source, context) =>
    at({ kind: 'update', value: `postfix${ts.tokenToString(source.operator)}` }, source, [
      context.get(source.operand),
    ]),
  [KIND.TypeOfExpression]: unaryOf('typeof'),
  [KIND.VoidExpression]: unaryOf('void'),
  [KIND.DeleteExpression]: unaryOf('delete'),
  [KIND.AwaitExpression]: unaryOf('await'),
  [KIND.ConditionalExpression]: (source, context) =>
    at('conditional', source, [
      context.get(source.condition),
      context.get(source.whenTrue),
      context.get(source.whenFalse),
    ]),
  [KIND.CallExpression]: callOf,
  [KIND.NewExpression]: newOf,
  [KIND.PropertyAccessExpression]: memberOf,
  [KIND.ElementAccessExpression]: indexOf,
  [KIND.ParenthesizedExpression]: wrapped,
  [KIND.AsExpression]: wrapped,
  [KIND.SatisfiesExpression]: wrapped,
  [KIND.TypeAssertionExpression]: wrapped,
  [KIND.NonNullExpression]: wrapped,
  [KIND.ExpressionWithTypeArguments]: wrapped,
  [KIND.ArrowFunction]: (source, context) => context.lambda(source),
  [KIND.FunctionExpression]: (source, context) => context.lambda(source),
  [KIND.SpreadElement]: grouped('spread'),
  [KIND.SpreadAssignment]: grouped('spread'),
  [KIND.YieldExpression]: (source, context) =>
    grouped(source.asteriskToken === undefined ? 'yield' : 'yield*')(source, context),
  [KIND.OmittedExpression]: () => NONE,
  [KIND.MetaProperty]: (source, context) => context.name(textOf(source, context), source),
  [KIND.ClassExpression]: (source, context) => opaque('expression', source, context),
};
