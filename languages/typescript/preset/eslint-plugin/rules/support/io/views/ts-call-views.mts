import type TypeScript from 'typescript';
import { ts } from '../../../typed/typescript-views.mts';
import {
  chainLinks,
  deepKeys,
  SPREAD,
  TEXT_KEYS,
  viewOf,
  type CallArgument,
  type CallView,
  type Child,
  type LiteralArgument,
  type Step,
} from './call-shapes.mts';

export type TsCall =
  TypeScript.CallExpression | TypeScript.NewExpression | TypeScript.TaggedTemplateExpression;

const MAX_RESOLVE_DEPTH = 4;

function isTsWrapper(
  node: TypeScript.Node,
): node is
  | TypeScript.AwaitExpression
  | TypeScript.ParenthesizedExpression
  | TypeScript.NonNullExpression
  | TypeScript.AsExpression {
  return (
    ts.isAwaitExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isAsExpression(node)
  );
}

function tsStep(node: TypeScript.Node): Step<TypeScript.Node, TypeScript.Identifier> {
  if (isTsWrapper(node)) {
    return { next: node.expression };
  }
  if (ts.isPropertyAccessExpression(node)) {
    return { name: node.name.text, next: node.expression };
  }
  if (ts.isElementAccessExpression(node)) {
    return { name: '[]', next: node.expression };
  }
  if (ts.isCallExpression(node)) {
    return { next: node.expression, called: true };
  }
  if (ts.isIdentifier(node)) {
    return { name: node.text, root: node };
  }
  return node.kind === ts.SyntaxKind.ThisKeyword ? { name: 'this' } : {};
}

function tsChildren(node: TypeScript.Node): Child<TypeScript.Node>[] {
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((element) => ({ value: element }));
  }
  return ts.isObjectLiteralExpression(node)
    ? node.properties.map((property) => ({
        key:
          property.name !== undefined && ts.isIdentifier(property.name)
            ? property.name.text
            : SPREAD,
        value: ts.isPropertyAssignment(property) ? property.initializer : undefined,
      }))
    : [];
}

function tsTemplateText(node: TypeScript.TemplateLiteral): string {
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join('?');
}

function tsText(node: TypeScript.Node): string | undefined {
  if (ts.isStringLiteral(node)) {
    return node.text;
  }
  const isTemplate = ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node);
  return isTemplate ? tsTemplateText(node) : undefined;
}

function isTsTextProperty(property: TypeScript.Node): property is TypeScript.PropertyAssignment {
  return (
    ts.isPropertyAssignment(property) &&
    ts.isIdentifier(property.name) &&
    TEXT_KEYS.has(property.name.text)
  );
}

function tsLiteral(node: TypeScript.Node): LiteralArgument {
  const text = tsText(node);
  if (text !== undefined) {
    return { type: 'text', text };
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return { type: 'function' };
  }
  if (ts.isObjectLiteralExpression(node)) {
    const statement = node.properties.find(isTsTextProperty);
    const statementText = statement === undefined ? undefined : tsText(statement.initializer);
    return { type: 'object', keys: deepKeys(node, tsChildren), text: statementText };
  }
  return ts.isArrayLiteralExpression(node)
    ? { type: 'object', keys: deepKeys(node, tsChildren) }
    : { type: 'other' };
}

function tsConstantInitializer(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
): TypeScript.Expression | undefined {
  const declaration = ts.isIdentifier(node)
    ? checker.getSymbolAtLocation(node)?.valueDeclaration
    : undefined;
  const isConstant =
    declaration !== undefined &&
    ts.isVariableDeclaration(declaration) &&
    (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) !== 0;
  return isConstant ? declaration.initializer : undefined;
}

function tsResolved(checker: TypeScript.TypeChecker, node: TypeScript.Node): TypeScript.Node {
  const steps = Array.from({ length: MAX_RESOLVE_DEPTH });
  return steps.reduce<TypeScript.Node>(
    (current) => tsConstantInitializer(checker, current) ?? current,
    node,
  );
}

function tsArgument(argument: TypeScript.Node, checker: TypeScript.TypeChecker): CallArgument {
  const node = tsResolved(checker, argument);
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
    const input = node.arguments?.[0];
    return {
      type: 'new',
      name: node.expression.text,
      input: input === undefined ? undefined : tsLiteral(input),
    };
  }
  return tsLiteral(node);
}

export function tsCallee(call: TsCall): TypeScript.Expression {
  return ts.isTaggedTemplateExpression(call) ? call.tag : call.expression;
}

export function tsCallView(
  call: TsCall,
  checker: TypeScript.TypeChecker,
): CallView<TypeScript.Identifier> {
  const { links, root } = chainLinks<TypeScript.Node, TypeScript.Identifier>(
    tsCallee(call),
    tsStep,
  );
  const args = ts.isTaggedTemplateExpression(call)
    ? [{ type: 'text' as const, text: tsTemplateText(call.template) }]
    : (call.arguments?.map((argument) => tsArgument(argument, checker)) ?? []);
  return viewOf(links, root, args);
}
