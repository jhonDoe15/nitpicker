import type TypeScript from 'typescript';
import { ts } from '../typed/typescript-views.mts';
import { chainEnd } from '../lifecycles/scope/close-scopes.mts';
import { nameOf } from '../request-inputs/bindings/import-bindings.mts';
import { transportOf } from '../request-inputs/bindings/nest-handlers.mts';
import {
  isRequest,
  transportSource,
  unwrapped,
} from '../request-inputs/bindings/request-calls.mts';
import {
  decoratorCall,
  decoratorsOf,
  isFromPackage,
} from '../request-inputs/bindings/ts-nodes.mts';

export type Binding =
  | {
      readonly kind: 'value';
      readonly name: string;
      readonly field: string;
      readonly anchor: TypeScript.Node;
    }
  | { readonly kind: 'object'; readonly name: string; readonly anchor: TypeScript.Node };
type Transport = NonNullable<ReturnType<typeof transportOf>>;

const TRIMMING_DECORATOR = /^(?:Trim|Strip)\w*$/u;
const TRIMMING_TEXT = /\b(?:trim|strip)\w*\s*\(/u;
const REQUEST_TEXT_SOURCES = new Set<string>(['query string', 'multipart form']);
const FALLBACKS = new Set<TypeScript.SyntaxKind>([
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
]);

function isStringCall(node: TypeScript.Node): node is TypeScript.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'String'
  );
}

function peelOnce(node: TypeScript.Expression): TypeScript.Expression | undefined {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isAsExpression(node)
  ) {
    return node.expression;
  }
  if (ts.isBinaryExpression(node) && FALLBACKS.has(node.operatorToken.kind)) {
    return node.left;
  }
  if (isStringCall(node) && node.arguments.length > 0) {
    return node.arguments[0];
  }
  return undefined;
}

function peeled(expression: TypeScript.Expression): TypeScript.Expression {
  return chainEnd(expression, peelOnce);
}

function isBag(node: TypeScript.Expression): boolean {
  const base = unwrapped(node);
  if (base !== undefined && ts.isPropertyAccessExpression(base) && base.name.text === 'body') {
    return isRequest(base.expression);
  }
  return transportSource(node) === 'query string';
}

function honoQuery(call: TypeScript.CallExpression): boolean {
  const callee = call.expression;
  return (
    call.arguments.length === 1 &&
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === 'query' &&
    ts.isPropertyAccessExpression(callee.expression) &&
    callee.expression.name.text === 'req'
  );
}

export function isRawRequestText(expression: TypeScript.Expression): boolean {
  const node = peeled(expression);
  if (ts.isCallExpression(node)) {
    return honoQuery(node);
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return isBag(node.expression);
  }
  return false;
}

function isRequestBag(expression: TypeScript.Expression): boolean {
  return isBag(peeled(expression));
}

function isStringType(type: TypeScript.TypeNode | undefined): boolean {
  if (type === undefined) {
    return false;
  }
  const parts = ts.isUnionTypeNode(type) ? type.types : [type];
  const present = parts.filter(
    (part) =>
      part.kind !== ts.SyntaxKind.UndefinedKeyword && part.kind !== ts.SyntaxKind.NullKeyword,
  );
  const [only] = present;
  return present.length === 1 && only?.kind === ts.SyntaxKind.StringKeyword;
}

function nestSource(parameter: TypeScript.ParameterDeclaration): Transport | undefined {
  const source = transportOf(parameter, { multipart: true });
  return source !== undefined && REQUEST_TEXT_SOURCES.has(source.source) ? source : undefined;
}

function isNestBody(parameter: TypeScript.ParameterDeclaration): boolean {
  return decoratorsOf(parameter).some((decorator) => {
    const call = decoratorCall(decorator);
    return (
      call.name === 'Body' &&
      call.base !== undefined &&
      isFromPackage(call.base, ['@nestjs/common'])
    );
  });
}

function nestArguments(
  parameter: TypeScript.ParameterDeclaration,
): readonly TypeScript.Expression[] | undefined {
  const source = nestSource(parameter);
  if (source !== undefined) {
    return source.arguments;
  }
  return isNestBody(parameter) ? [] : undefined;
}

function nestBinding(parameter: TypeScript.ParameterDeclaration): Binding | undefined {
  const decoratorArguments = nestArguments(parameter);
  if (decoratorArguments === undefined || !ts.isIdentifier(parameter.name)) {
    return undefined;
  }
  const [first] = decoratorArguments;
  const single = first !== undefined && ts.isStringLiteralLike(first);
  if (single) {
    return isStringType(parameter.type)
      ? { kind: 'value', name: parameter.name.text, field: first.text, anchor: parameter }
      : undefined;
  }
  return parameter.type !== undefined && ts.isTypeReferenceNode(parameter.type)
    ? { kind: 'object', name: parameter.name.text, anchor: parameter }
    : undefined;
}

export function declaredBindings(node: TypeScript.Node): Binding[] {
  if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
    if (ts.isIdentifier(node.name) && isRawRequestText(node.initializer)) {
      return [{ kind: 'value', name: node.name.text, field: node.name.text, anchor: node }];
    }
    if (ts.isObjectBindingPattern(node.name) && isRequestBag(node.initializer)) {
      return node.name.elements.flatMap<Binding>((element) =>
        ts.isIdentifier(element.name) && element.initializer === undefined
          ? [
              {
                kind: 'value',
                name: element.name.text,
                field: nameOf(element.propertyName) ?? element.name.text,
                anchor: element,
              },
            ]
          : [],
      );
    }
  }
  const nest = ts.isParameter(node) ? nestBinding(node) : undefined;
  return nest === undefined ? [] : [nest];
}

export function fieldIsTrimmed(declaration: TypeScript.Node): boolean {
  return decoratorsOf(declaration).some(
    (decorator) =>
      TRIMMING_DECORATOR.test(decorator.expression.getText().replace(/\(.*$/su, '')) ||
      TRIMMING_TEXT.test(decorator.getText()),
  );
}

export function isTrimmingAssignment(node: TypeScript.Node, name: string): boolean {
  return (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isIdentifier(node.left) &&
    node.left.text === name &&
    TRIMMING_TEXT.test(node.right.getText())
  );
}
