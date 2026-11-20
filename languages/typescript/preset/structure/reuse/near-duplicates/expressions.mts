import type TypeScript from 'typescript';
import { typescriptApi } from '../../../../adapters/typed/typescript-program.mts';
import { NONE, at, on, opaque, optional, textOf } from './tree-nodes.mts';
import type {
  Converted,
  Converter,
  ConverterTable,
  TreeContext,
  TreeNode,
} from './typed/tree-types.mts';

type TextNode = TypeScript.Node & { readonly text: string };
type WithExpression = TypeScript.Node & { readonly expression?: TypeScript.Expression | undefined };

const ts = typescriptApi();
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

function literal(
  guard: (node: TypeScript.Node) => node is TextNode,
  kind: string,
  value: (source: TextNode) => string,
): Converter {
  return on(guard, (source) =>
    at({ kind: 'literal', literal: kind, value: value(source) }, source),
  );
}

function keyword(kind: string, value: string): Converter {
  return (source) => at({ kind: 'literal', literal: kind, value }, source);
}

function quoted(source: TextNode): string {
  return JSON.stringify(source.text);
}

function operatorText(kind: TypeScript.SyntaxKind): string {
  return String(ts.tokenToString(kind));
}

function binaryOf(source: TypeScript.BinaryExpression, context: TreeContext): TreeNode {
  const operator = operatorText(source.operatorToken.kind);
  const children = [context.get(source.left), context.get(source.right)];
  if (source.operatorToken.kind === KIND.CommaToken) {
    return at({ kind: 'expression', value: 'comma' }, source, children);
  }
  const kind = ASSIGNMENTS.has(source.operatorToken.kind) ? 'assign' : 'binary';
  return at({ kind, value: operator }, source, children);
}

function prefixOf(source: TypeScript.PrefixUnaryExpression, context: TreeContext): TreeNode {
  const operator = operatorText(source.operator);
  const isUpdate = operator === '++' || operator === '--';
  return isUpdate
    ? at({ kind: 'update', value: `prefix${operator}` }, source, [context.get(source.operand)])
    : at({ kind: 'unary', value: operator }, source, [context.get(source.operand)]);
}

function unaryOf(operator: string): (source: WithExpression, context: TreeContext) => TreeNode {
  return (source, context) =>
    at({ kind: 'unary', value: operator }, source, [optional(source.expression, context)]);
}

function callOf(source: TypeScript.CallExpression, context: TreeContext): TreeNode {
  const children = [context.get(source.expression), ...source.arguments.map(context.get)];
  return source.questionDotToken === undefined
    ? at('call', source, children)
    : at({ kind: 'expression', value: 'optional-call' }, source, children);
}

function memberOf(source: TypeScript.PropertyAccessExpression, context: TreeContext): TreeNode {
  const optionalChain = source.questionDotToken === undefined ? '' : '?.';
  return at({ kind: 'member', value: `${optionalChain}${source.name.text}` }, source, [
    context.get(source.expression),
  ]);
}

function indexOf(source: TypeScript.ElementAccessExpression, context: TreeContext): TreeNode {
  const children = [context.get(source.expression), context.get(source.argumentExpression)];
  return source.questionDotToken === undefined
    ? at('index', source, children)
    : at({ kind: 'expression', value: 'optional-index' }, source, children);
}

function newOf(source: TypeScript.NewExpression, context: TreeContext): TreeNode {
  const type = at({ kind: 'type', value: textOf(source.expression, context) }, source.expression);
  return at('new', source, [type, ...(source.arguments ?? []).map(context.get)]);
}

function wrapped(
  source: TypeScript.Node & { readonly expression: TypeScript.Expression },
  context: TreeContext,
): Converted {
  return context.get(source.expression);
}

function grouped(value: string): (source: WithExpression, context: TreeContext) => TreeNode {
  return (source, context) =>
    at({ kind: 'expression', value }, source, [optional(source.expression, context)]);
}

export const EXPRESSIONS: ConverterTable = {
  [KIND.Identifier]: on(ts.isIdentifier, (source, context) => context.name(source.text, source)),
  [KIND.StringLiteral]: literal(ts.isStringLiteralLike, 'string', quoted),
  [KIND.NoSubstitutionTemplateLiteral]: literal(ts.isStringLiteralLike, 'string', quoted),
  [KIND.NumericLiteral]: literal(ts.isNumericLiteral, 'number', (source) =>
    String(Number(source.text)),
  ),
  [KIND.BigIntLiteral]: literal(ts.isBigIntLiteral, 'bigint', (source) => source.text),
  [KIND.RegularExpressionLiteral]: literal(
    ts.isRegularExpressionLiteral,
    'regexp',
    (source) => source.text,
  ),
  [KIND.TrueKeyword]: keyword('boolean', 'true'),
  [KIND.FalseKeyword]: keyword('boolean', 'false'),
  [KIND.NullKeyword]: keyword('null', 'null'),
  [KIND.ThisKeyword]: (source) => at('this', source),
  [KIND.SuperKeyword]: (source, context) => context.name('super', source),
  [KIND.ImportKeyword]: (source, context) => context.name('import', source),
  [KIND.BinaryExpression]: on(ts.isBinaryExpression, binaryOf),
  [KIND.PrefixUnaryExpression]: on(ts.isPrefixUnaryExpression, prefixOf),
  [KIND.PostfixUnaryExpression]: on(ts.isPostfixUnaryExpression, (source, context) =>
    at({ kind: 'update', value: `postfix${operatorText(source.operator)}` }, source, [
      context.get(source.operand),
    ]),
  ),
  [KIND.TypeOfExpression]: on(ts.isTypeOfExpression, unaryOf('typeof')),
  [KIND.VoidExpression]: on(ts.isVoidExpression, unaryOf('void')),
  [KIND.DeleteExpression]: on(ts.isDeleteExpression, unaryOf('delete')),
  [KIND.AwaitExpression]: on(ts.isAwaitExpression, unaryOf('await')),
  [KIND.ConditionalExpression]: on(ts.isConditionalExpression, (source, context) =>
    at('conditional', source, [
      context.get(source.condition),
      context.get(source.whenTrue),
      context.get(source.whenFalse),
    ]),
  ),
  [KIND.CallExpression]: on(ts.isCallExpression, callOf),
  [KIND.NewExpression]: on(ts.isNewExpression, newOf),
  [KIND.PropertyAccessExpression]: on(ts.isPropertyAccessExpression, memberOf),
  [KIND.ElementAccessExpression]: on(ts.isElementAccessExpression, indexOf),
  [KIND.ParenthesizedExpression]: on(ts.isParenthesizedExpression, wrapped),
  [KIND.AsExpression]: on(ts.isAsExpression, wrapped),
  [KIND.SatisfiesExpression]: on(ts.isSatisfiesExpression, wrapped),
  [KIND.TypeAssertionExpression]: on(ts.isTypeAssertionExpression, wrapped),
  [KIND.NonNullExpression]: on(ts.isNonNullExpression, wrapped),
  [KIND.ExpressionWithTypeArguments]: on(ts.isExpressionWithTypeArguments, wrapped),
  [KIND.ArrowFunction]: on(ts.isArrowFunction, (source, context) => context.lambda(source)),
  [KIND.FunctionExpression]: on(ts.isFunctionExpression, (source, context) =>
    context.lambda(source),
  ),
  [KIND.SpreadElement]: on(ts.isSpreadElement, grouped('spread')),
  [KIND.SpreadAssignment]: on(ts.isSpreadAssignment, grouped('spread')),
  [KIND.YieldExpression]: on(ts.isYieldExpression, (source, context) =>
    grouped(source.asteriskToken === undefined ? 'yield' : 'yield*')(source, context),
  ),
  [KIND.OmittedExpression]: () => NONE,
  [KIND.MetaProperty]: on(ts.isMetaProperty, (source, context) =>
    context.name(textOf(source, context), source),
  ),
  [KIND.ClassExpression]: (source, context) => opaque('expression', source, context),
};
