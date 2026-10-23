import ts from 'typescript';
import { chainOf, depthFirst } from '../../../../../../../shared/traversal.mjs';
import { syntaxChildren } from '../../../../syntax/children.mjs';
import {
  isRegistrationName,
  isRegistrationProperty,
  isRegistrationSymbol,
} from '../container-apis.mjs';
import { memberNameNode } from '../lookup-sites.mjs';
import { functionsOf, functionsOfSymbol, unwrapExpression } from './function-shapes.mjs';

const PASSING_OPERATORS = new Set([
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.CommaToken,
]);

function propertyKey(name) {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
}

function isRegistrationCall(checker, call) {
  const name = memberNameNode(unwrapExpression(call.expression));
  return (
    name !== undefined &&
    isRegistrationName(name.text) &&
    isRegistrationSymbol(checker.getSymbolAtLocation(name))
  );
}

function isRegistrationPoint(checker, holder, child) {
  if (ts.isPropertyAssignment(holder)) {
    return holder.initializer === child && isRegistrationProperty(propertyKey(holder.name));
  }
  return (
    ts.isCallExpression(holder) &&
    holder.arguments.includes(child) &&
    isRegistrationCall(checker, holder)
  );
}

function passesThrough(holder, child) {
  if (ts.isCallExpression(holder) || ts.isNewExpression(holder)) {
    return holder.arguments?.includes(child) === true;
  }
  if (ts.isConditionalExpression(holder)) {
    return holder.condition !== child;
  }
  if (ts.isBinaryExpression(holder)) {
    return PASSING_OPERATORS.has(holder.operatorToken.kind);
  }
  return unwrapExpression(holder) !== holder;
}

function passingParent(child) {
  const holder = child.parent;
  return holder !== undefined && passesThrough(holder, child) ? holder : undefined;
}

function climbsToRegistration(checker, start) {
  return chainOf(start, passingParent).some(
    (child) => child.parent !== undefined && isRegistrationPoint(checker, child.parent, child),
  );
}

function isRegisteredLiteral(checker, fn) {
  if (ts.isMethodDeclaration(fn) && ts.isObjectLiteralExpression(fn.parent)) {
    return isRegistrationProperty(propertyKey(fn.name));
  }
  return climbsToRegistration(checker, fn);
}

function registeredExpressions(checker, node) {
  if (ts.isPropertyAssignment(node) && isRegistrationProperty(propertyKey(node.name))) {
    return [node.initializer];
  }
  if (ts.isShorthandPropertyAssignment(node) && isRegistrationProperty(node.name.text)) {
    return [node];
  }
  return ts.isCallExpression(node) && isRegistrationCall(checker, node) ? [...node.arguments] : [];
}

function functionsReferencedBy(checker, expression) {
  if (ts.isShorthandPropertyAssignment(expression)) {
    return functionsOfSymbol(
      checker,
      checker.getShorthandAssignmentValueSymbol(expression),
      'reference',
    );
  }
  const inner = unwrapExpression(expression);
  return ts.isIdentifier(inner) || ts.isPropertyAccessExpression(inner)
    ? functionsOf(checker, inner, 'reference')
    : [];
}

function referencedFunctions(checker, expression) {
  const found = [];
  const pending = [expression];
  for (const current of pending) {
    found.push(...functionsReferencedBy(checker, current));
    const inner = ts.isShorthandPropertyAssignment(current) ? current : unwrapExpression(current);
    pending.push(...(ts.isCallExpression(inner) ? inner.arguments : []));
  }
  return found;
}

function collectRegistered(context) {
  const { program, checker } = context;
  const sources = program
    .getSourceFiles()
    .filter(
      (source) => !source.isDeclarationFile && !program.isSourceFileFromExternalLibrary(source),
    );
  return new Set(
    sources.flatMap((source) =>
      [...depthFirst(source, syntaxChildren)].flatMap((node) =>
        registeredExpressions(checker, node).flatMap((expression) =>
          referencedFunctions(checker, expression),
        ),
      ),
    ),
  );
}

function registeredFunctions(context) {
  if (!context.memo.has('registered')) {
    context.memo.set('registered', collectRegistered(context));
  }
  return context.memo.get('registered');
}

export function isInRegistration(context, node) {
  return (
    ts.findAncestor(node.parent, (ancestor) => {
      return (
        ts.isFunctionLike(ancestor) &&
        (isRegisteredLiteral(context.checker, ancestor) ||
          registeredFunctions(context).has(ancestor))
      );
    }) !== undefined
  );
}
