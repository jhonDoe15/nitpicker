import { chainEnd } from '../lifecycles/scope/close-scopes.mjs';
import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { transportOf } from '../request-inputs/bindings/nest-handlers.mjs';
import {
  isRequest,
  transportSource,
  unwrapped,
} from '../request-inputs/bindings/request-calls.mjs';
import {
  decoratorCall,
  decoratorsOf,
  isFromPackage,
  nameOf,
} from '../request-inputs/bindings/ts-nodes.mjs';

const TRIMMING_DECORATOR = /^(?:Trim|Strip)\w*$/u;
const TRIMMING_TEXT = /\b(?:trim|strip)\w*\s*\(/u;
const REQUEST_TEXT_SOURCES = new Set(['query string', 'multipart form']);
const FALLBACKS = new Set([ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken]);

function isStringCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'String'
  );
}

function peelOnce(node) {
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

function peeled(expression) {
  return chainEnd(expression, peelOnce);
}

function isBag(node) {
  const base = unwrapped(node);
  if (ts.isPropertyAccessExpression(base) && base.name.text === 'body') {
    return isRequest(base.expression);
  }
  return transportSource(base) === 'query string';
}

function honoQuery(call) {
  const callee = call.expression;
  return (
    call.arguments.length === 1 &&
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === 'query' &&
    ts.isPropertyAccessExpression(callee.expression) &&
    callee.expression.name.text === 'req'
  );
}

export function isRawRequestText(expression) {
  const node = peeled(expression);
  if (ts.isCallExpression(node)) {
    return honoQuery(node);
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return isBag(node.expression);
  }
  return false;
}

function isRequestBag(expression) {
  return isBag(peeled(expression));
}

function isStringType(type) {
  if (type === undefined) {
    return false;
  }
  const parts = ts.isUnionTypeNode(type) ? type.types : [type];
  const present = parts.filter(
    (part) =>
      part.kind !== ts.SyntaxKind.UndefinedKeyword && part.kind !== ts.SyntaxKind.NullKeyword,
  );
  return present.length === 1 && present[0].kind === ts.SyntaxKind.StringKeyword;
}

function nestSource(parameter) {
  const source = transportOf(parameter, true);
  return source !== undefined && REQUEST_TEXT_SOURCES.has(source.source) ? source : undefined;
}

function isNestBody(parameter) {
  return decoratorsOf(parameter).some((decorator) => {
    const call = decoratorCall(decorator);
    return (
      call.name === 'Body' &&
      call.base !== undefined &&
      isFromPackage(call.base, ['@nestjs/common'])
    );
  });
}

function nestArguments(parameter) {
  const source = nestSource(parameter);
  if (source !== undefined) {
    return source.arguments;
  }
  return isNestBody(parameter) ? [] : undefined;
}

function nestBinding(parameter) {
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

export function declaredBindings(node) {
  if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
    if (ts.isIdentifier(node.name) && isRawRequestText(node.initializer)) {
      return [{ kind: 'value', name: node.name.text, field: node.name.text, anchor: node }];
    }
    if (ts.isObjectBindingPattern(node.name) && isRequestBag(node.initializer)) {
      return node.name.elements
        .filter((element) => ts.isIdentifier(element.name) && element.initializer === undefined)
        .map((element) => ({
          kind: 'value',
          name: element.name.text,
          field: nameOf(element.propertyName) ?? element.name.text,
          anchor: element,
        }));
    }
  }
  const nest = ts.isParameter(node) ? nestBinding(node) : undefined;
  return nest === undefined ? [] : [nest];
}

export function fieldIsTrimmed(declaration) {
  return decoratorsOf(declaration).some(
    (decorator) =>
      TRIMMING_DECORATOR.test(decorator.expression.getText().replace(/\(.*$/su, '')) ||
      TRIMMING_TEXT.test(decorator.getText()),
  );
}

export function isTrimmingAssignment(node, name) {
  return (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isIdentifier(node.left) &&
    node.left.text === name &&
    TRIMMING_TEXT.test(node.right.getText())
  );
}
