import path from 'node:path';
import ts from 'typescript';
import { chainOf } from '../../../../../shared/traversal.mjs';
import { calleeName, unwrapExpression } from './passes.mjs';

const WRAPPERS = new Set(['memo', 'forwardRef']);
const OPTIONS_NAME = /^(?:options?|opts?|config|configuration|settings|params|parameters|args)$/iu;
const OPTIONS_TYPE = /(?:Options?|Opts|Config|Settings)$/u;
const COMPONENT_NAME = /^[A-Z]/u;

export function isWrapperCall(node) {
  return ts.isCallExpression(node) && WRAPPERS.has(calleeName(node.expression));
}

function isFunctionExpression(node) {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function innerComponent(node) {
  return isWrapperCall(node) && node.arguments.length > 0
    ? unwrapExpression(node.arguments[0])
    : undefined;
}

function unwrapComponent(expression) {
  return chainOf(unwrapExpression(expression), innerComponent).at(-1);
}

function functionDeclarationCandidate(statement, checker) {
  if (statement.body === undefined) return [];
  const symbol =
    statement.name === undefined ? undefined : checker?.getSymbolAtLocation(statement.name);
  return [
    {
      name: statement.name?.text ?? 'default',
      fn: statement,
      keyNodes: symbol?.declarations ?? [statement],
    },
  ];
}

function variableCandidates(statement) {
  return statement.declarationList.declarations.flatMap((declaration) => {
    const fn = declaration.initializer && unwrapComponent(declaration.initializer);
    return ts.isIdentifier(declaration.name) && isFunctionExpression(fn)
      ? [{ name: declaration.name.text, fn, keyNodes: [declaration] }]
      : [];
  });
}

function assignmentCandidates(statement) {
  const fn = unwrapComponent(statement.expression);
  return isFunctionExpression(fn) && !statement.isExportEquals
    ? [{ name: 'default', fn, keyNodes: [statement] }]
    : [];
}

/** Top-level functions, `const` functions (also inside `memo`/`forwardRef`) and default exports. */
export function candidatesOf(sourceFile, checker) {
  return sourceFile.statements.flatMap((statement) => {
    if (ts.isFunctionDeclaration(statement))
      return functionDeclarationCandidate(statement, checker);
    if (ts.isVariableStatement(statement)) return variableCandidates(statement);
    return ts.isExportAssignment(statement) ? assignmentCandidates(statement) : [];
  });
}

function referenceName(typeNode) {
  if (typeNode === undefined || !ts.isTypeReferenceNode(typeNode)) return undefined;
  const name = typeNode.typeName;
  return ts.isIdentifier(name) ? name.text : name.right.text;
}

export function isOptionsParameter(parameter) {
  if (ts.isObjectBindingPattern(parameter.name)) return true;
  if (ts.isIdentifier(parameter.name) && OPTIONS_NAME.test(parameter.name.text)) return true;
  return OPTIONS_TYPE.test(referenceName(parameter.type) ?? '');
}

export function isComponentCandidate({ candidate, fileName, react }) {
  return (
    react &&
    path.extname(fileName) === '.tsx' &&
    (COMPONENT_NAME.test(candidate.name) || candidate.name === 'default')
  );
}

function isCheckable(candidate, fileName, react) {
  return isComponentCandidate({ candidate, fileName, react })
    ? candidate.fn.parameters.length > 0
    : candidate.fn.parameters.some(isOptionsParameter);
}

/** A syntax-only check that a file declares a component with props or an options parameter. */
export function declaresCheckable(sourceFile, react) {
  return candidatesOf(sourceFile).some((candidate) =>
    isCheckable(candidate, sourceFile.fileName, react),
  );
}
