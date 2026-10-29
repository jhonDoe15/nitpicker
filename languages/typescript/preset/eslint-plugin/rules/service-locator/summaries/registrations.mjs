import ts from 'typescript';
import { chainOf, depthFirst } from '../../../../../../../shared/traversal.mjs';
import { syntaxChildren } from '../../../../syntax/children.mjs';
import {
  isFactoryHolderName,
  isFactoryHolderSymbol,
  isFactoryProperty,
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

function calleeName(call) {
  const callee = unwrapExpression(call.expression);
  return ts.isIdentifier(callee) ? callee : memberNameNode(callee);
}

function symbolAt(checker, name) {
  const symbol = checker.getSymbolAtLocation(name);
  return symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

function isRegistrationCall(checker, call) {
  const name = calleeName(call);
  return (
    name !== undefined &&
    isRegistrationName(name.text) &&
    isRegistrationSymbol(symbolAt(checker, name))
  );
}

function isFactoryHolderArgument(checker, literal) {
  const call = literal.parent;
  if (!ts.isCallExpression(call) || !call.arguments.includes(literal)) {
    return false;
  }
  const name = calleeName(call);
  return (
    name !== undefined &&
    isFactoryHolderName(name.text) &&
    isFactoryHolderSymbol(symbolAt(checker, name))
  );
}

function isRegistrationKey(checker, property) {
  const key = propertyKey(property.name);
  return (
    ts.isObjectLiteralExpression(property.parent) &&
    (isRegistrationProperty(key) ||
      (isFactoryProperty(key) && isFactoryHolderArgument(checker, property.parent)))
  );
}

function isRegistrationPoint(checker, holder, child) {
  if (ts.isPropertyAssignment(holder)) {
    return holder.initializer === child && isRegistrationKey(checker, holder);
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
    return isRegistrationKey(checker, fn);
  }
  return climbsToRegistration(checker, fn);
}

function registeredExpressions(checker, node) {
  if (ts.isPropertyAssignment(node) && isRegistrationKey(checker, node)) {
    return [node.initializer];
  }
  if (ts.isShorthandPropertyAssignment(node) && isRegistrationKey(checker, node)) {
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

function registeredSite(context, ancestor) {
  return (
    (ts.isFunctionLike(ancestor) || ts.isClassLike(ancestor)) &&
    (isRegisteredLiteral(context.checker, ancestor) || registeredFunctions(context).has(ancestor))
  );
}

export function isInRegistration(context, node) {
  const { parent } = node;
  const start = ts.isCallExpression(parent) && parent.expression === node ? parent : node;
  return (
    climbsToRegistration(context.checker, start) ||
    ts.findAncestor(node.parent, (ancestor) => registeredSite(context, ancestor)) !== undefined
  );
}
