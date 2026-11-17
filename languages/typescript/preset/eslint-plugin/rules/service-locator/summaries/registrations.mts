import type TypeScript from 'typescript';
import { chainOf, depthFirst } from '../../typed/node-views.mts';
import { aliasedSymbolAt, ts } from '../../typed/typescript-views.mts';
import {
  isFactoryHolderName,
  isFactoryHolderSymbol,
  isFactoryProperty,
  isRegistrationName,
  isRegistrationProperty,
  isRegistrationSymbol,
} from '../container-apis.mts';
import { memberNameNode } from '../lookup-sites.mts';
import {
  functionsOf,
  functionsOfSymbol,
  includesNode,
  parentNode,
  syntaxChildren,
  unwrapExpression,
  type ResolvedFunction,
} from './function-shapes.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';

export type RegistrationContext = {
  readonly program: TypeScript.Program;
  readonly checker: TypeScript.TypeChecker;
  readonly memo: Map<string, ReadonlySet<TypeScript.Node>>;
};
type RegistrationKeyOwner =
  | TypeScript.PropertyAssignment
  | TypeScript.ShorthandPropertyAssignment
  | TypeScript.MethodDeclaration;

const PASSING_OPERATORS = new Set<TypeScript.SyntaxKind>([
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.CommaToken,
]);

function propertyKey(name: TypeScript.Node): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
}

function calleeName(
  call: TypeScript.CallExpression,
): TypeScript.Identifier | TypeScript.MemberName | TypeScript.StringLiteralLike | undefined {
  const callee = unwrapExpression(call.expression);
  return ts.isIdentifier(callee) ? callee : memberNameNode(callee);
}

function isRegistrationCall(
  checker: TypeScript.TypeChecker,
  call: TypeScript.CallExpression,
): boolean {
  const name = calleeName(call);
  return (
    name !== undefined &&
    isRegistrationName(name.text) &&
    isRegistrationSymbol(aliasedSymbolAt(checker, name))
  );
}

function isFactoryHolderArgument(
  checker: TypeScript.TypeChecker,
  literal: TypeScript.ObjectLiteralExpression,
): boolean {
  const call = literal.parent;
  if (!(ts.isCallExpression(call) && call.arguments.includes(literal))) {
    return false;
  }
  const name = calleeName(call);
  return (
    name !== undefined &&
    isFactoryHolderName(name.text) &&
    isFactoryHolderSymbol(aliasedSymbolAt(checker, name))
  );
}

function isRegistrationKey(
  checker: TypeScript.TypeChecker,
  property: RegistrationKeyOwner,
): boolean {
  const key = propertyKey(property.name);
  return (
    ts.isObjectLiteralExpression(property.parent) &&
    (isRegistrationProperty(key) ||
      (isFactoryProperty(key) && isFactoryHolderArgument(checker, property.parent)))
  );
}

function isRegistrationPoint(
  checker: TypeScript.TypeChecker,
  holder: TypeScript.Node,
  child: TypeScript.Node,
): boolean {
  if (ts.isPropertyAssignment(holder)) {
    return holder.initializer === child && isRegistrationKey(checker, holder);
  }
  return (
    ts.isCallExpression(holder) &&
    includesNode(holder.arguments, child) &&
    isRegistrationCall(checker, holder)
  );
}

function passesThrough(holder: TypeScript.Node, child: TypeScript.Node): boolean {
  if (ts.isCallExpression(holder) || ts.isNewExpression(holder)) {
    return includesNode(holder.arguments, child);
  }
  if (ts.isConditionalExpression(holder)) {
    return holder.condition !== child;
  }
  if (ts.isBinaryExpression(holder)) {
    return PASSING_OPERATORS.has(holder.operatorToken.kind);
  }
  return unwrapExpression(holder) !== holder;
}

function passingParent(child: TypeScript.Node): TypeScript.Node | undefined {
  const holder = parentNode(child);
  return holder !== undefined && passesThrough(holder, child) ? holder : undefined;
}

function climbsToRegistration(checker: TypeScript.TypeChecker, start: TypeScript.Node): boolean {
  return chainOf<TypeScript.Node>(start, passingParent).some((child) => {
    const holder = parentNode(child);
    return holder !== undefined && isRegistrationPoint(checker, holder, child);
  });
}

function isRegisteredLiteral(checker: TypeScript.TypeChecker, fn: TypeScript.Node): boolean {
  if (ts.isMethodDeclaration(fn) && ts.isObjectLiteralExpression(fn.parent)) {
    return isRegistrationKey(checker, fn);
  }
  return climbsToRegistration(checker, fn);
}

function registeredExpressions(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
): TypeScript.Node[] {
  if (ts.isPropertyAssignment(node) && isRegistrationKey(checker, node)) {
    return [node.initializer];
  }
  if (ts.isShorthandPropertyAssignment(node) && isRegistrationKey(checker, node)) {
    return [node];
  }
  return ts.isCallExpression(node) && isRegistrationCall(checker, node) ? [...node.arguments] : [];
}

function functionsReferencedBy(
  checker: TypeScript.TypeChecker,
  expression: TypeScript.Node,
): ResolvedFunction[] {
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

function referencedFunctions(
  checker: TypeScript.TypeChecker,
  expression: TypeScript.Node,
): ResolvedFunction[] {
  const found: ResolvedFunction[] = [];
  const pending = [expression];
  for (const current of pending) {
    appendAll(found, functionsReferencedBy(checker, current));
    const inner = ts.isShorthandPropertyAssignment(current) ? current : unwrapExpression(current);
    appendAll(pending, ts.isCallExpression(inner) ? inner.arguments : []);
  }
  return found;
}

function collectRegistered(context: RegistrationContext): ReadonlySet<TypeScript.Node> {
  const { program, checker } = context;
  const sources = program
    .getSourceFiles()
    .filter(
      (source) => !(source.isDeclarationFile || program.isSourceFileFromExternalLibrary(source)),
    );
  return new Set<TypeScript.Node>(
    sources.flatMap((source) =>
      [...depthFirst<TypeScript.Node>(source, syntaxChildren)].flatMap((node) =>
        registeredExpressions(checker, node).flatMap((expression) =>
          referencedFunctions(checker, expression),
        ),
      ),
    ),
  );
}

function registeredFunctions(context: RegistrationContext): ReadonlySet<TypeScript.Node> {
  const cached = context.memo.get('registered');
  if (cached !== undefined) {
    return cached;
  }
  const found = collectRegistered(context);
  context.memo.set('registered', found);
  return found;
}

function registeredSite(context: RegistrationContext, ancestor: TypeScript.Node): boolean {
  return (
    (ts.isFunctionLike(ancestor) || ts.isClassLike(ancestor)) &&
    (isRegisteredLiteral(context.checker, ancestor) || registeredFunctions(context).has(ancestor))
  );
}

export function isInRegistration(context: RegistrationContext, node: TypeScript.Node): boolean {
  const { parent } = node;
  const start = ts.isCallExpression(parent) && parent.expression === node ? parent : node;
  return (
    climbsToRegistration(context.checker, start) ||
    ts.findAncestor(node.parent, (ancestor) => registeredSite(context, ancestor)) !== undefined
  );
}
