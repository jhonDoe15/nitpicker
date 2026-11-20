import path from 'node:path';
import type TypeScript from 'typescript';
import { chainOf, typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import type { Candidate } from '../typed/context-types.mts';
import { calleeName, unwrapExpression } from './passes.mts';

type FunctionExpressionLike = TypeScript.ArrowFunction | TypeScript.FunctionExpression;

const ts = typescriptApi();
const WRAPPERS = new Set<string | undefined>(['memo', 'forwardRef']);
const OPTIONS_NAME = /^(?:options?|opts?|config|configuration|settings|params|parameters|args)$/iu;
const OPTIONS_TYPE = /(?:Options?|Opts|Config|Settings)$/u;
const COMPONENT_NAME = /^[A-Z]/u;

export function isWrapperCall(node: TypeScript.Node): node is TypeScript.CallExpression {
  return ts.isCallExpression(node) && WRAPPERS.has(calleeName(node.expression));
}

function isFunctionExpression(node: TypeScript.Node | undefined): node is FunctionExpressionLike {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function innerComponent(node: TypeScript.Expression): TypeScript.Expression | undefined {
  const [first] = isWrapperCall(node) ? node.arguments : [];
  return first === undefined ? undefined : unwrapExpression(first);
}

function unwrapComponent(expression: TypeScript.Expression): TypeScript.Expression | undefined {
  return chainOf(unwrapExpression(expression), innerComponent).at(-1);
}

function functionDeclarationCandidate(
  statement: TypeScript.FunctionDeclaration,
  checker: TypeScript.TypeChecker | undefined,
): Candidate[] {
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

function variableCandidates(statement: TypeScript.VariableStatement): Candidate[] {
  return statement.declarationList.declarations.flatMap((declaration) => {
    const fn = declaration.initializer && unwrapComponent(declaration.initializer);
    return ts.isIdentifier(declaration.name) && isFunctionExpression(fn)
      ? [{ name: declaration.name.text, fn, keyNodes: [declaration] }]
      : [];
  });
}

function assignmentCandidates(statement: TypeScript.ExportAssignment): Candidate[] {
  const fn = unwrapComponent(statement.expression);
  return isFunctionExpression(fn) && !statement.isExportEquals
    ? [{ name: 'default', fn, keyNodes: [statement] }]
    : [];
}

export function candidatesOf(
  sourceFile: TypeScript.SourceFile,
  checker?: TypeScript.TypeChecker,
): Candidate[] {
  return sourceFile.statements.flatMap((statement) => {
    if (ts.isFunctionDeclaration(statement))
      return functionDeclarationCandidate(statement, checker);
    if (ts.isVariableStatement(statement)) return variableCandidates(statement);
    return ts.isExportAssignment(statement) ? assignmentCandidates(statement) : [];
  });
}

function referenceName(typeNode: TypeScript.TypeNode | undefined): string | undefined {
  if (typeNode === undefined || !ts.isTypeReferenceNode(typeNode)) return undefined;
  const name = typeNode.typeName;
  return ts.isIdentifier(name) ? name.text : name.right.text;
}

export function isOptionsParameter(parameter: TypeScript.ParameterDeclaration): boolean {
  if (ts.isObjectBindingPattern(parameter.name)) return true;
  if (ts.isIdentifier(parameter.name) && OPTIONS_NAME.test(parameter.name.text)) return true;
  return OPTIONS_TYPE.test(referenceName(parameter.type) ?? '');
}

export function bindingMembers(
  parameter: TypeScript.ParameterDeclaration,
): Map<string, TypeScript.BindingElement> {
  if (!ts.isObjectBindingPattern(parameter.name)) {
    return new Map();
  }
  const elements = parameter.name.elements;
  if (elements.some((element) => element.dotDotDotToken !== undefined)) {
    return new Map();
  }
  const named = elements.map((element) => ({
    name: element.propertyName === undefined ? element.name : element.propertyName,
    element,
  }));
  return new Map(
    named.flatMap(({ name, element }) =>
      ts.isIdentifier(name) ? [[name.text, element] as const] : [],
    ),
  );
}

export function isComponentCandidate({
  candidate,
  fileName,
  react,
}: {
  readonly candidate: Candidate;
  readonly fileName: string;
  readonly react: boolean;
}): boolean {
  return (
    react &&
    path.extname(fileName) === '.tsx' &&
    (COMPONENT_NAME.test(candidate.name) || candidate.name === 'default')
  );
}

function isCheckable(candidate: Candidate, fileName: string, react: boolean): boolean {
  return isComponentCandidate({ candidate, fileName, react })
    ? candidate.fn.parameters.length > 0
    : candidate.fn.parameters.some(isOptionsParameter);
}

export function declaresCheckable(sourceFile: TypeScript.SourceFile, react: boolean): boolean {
  return candidatesOf(sourceFile).some((candidate) =>
    isCheckable(candidate, sourceFile.fileName, react),
  );
}
