import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';

const ts = typescriptApi();

export type Naming = { readonly name: string; readonly containerName: string | undefined };

type Segment = { readonly name: string; readonly anchored: boolean };

function firstResult<Input extends readonly unknown[], Result>(
  resolvers: readonly ((...inputs: Input) => Result | undefined)[],
  ...inputs: Input
): Result | undefined {
  for (const resolve of resolvers) {
    const result = resolve(...inputs);
    if (result !== undefined) {
      return result;
    }
  }
  return undefined;
}

export function propertyName(name: TypeScript.Node): string {
  if (ts.isPrivateIdentifier(name)) {
    return name.getText();
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
}

export function displayName(containerName: string | undefined, functionName: string): string {
  if (!containerName) {
    return functionName;
  }
  return functionName.startsWith('[')
    ? `${containerName}${functionName}`
    : `${containerName}.${functionName}`;
}

function dottedAccessRoot(node: TypeScript.Node): string | undefined {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (node.kind === ts.SyntaxKind.ThisKeyword) {
    return 'this';
  }
  return node.kind === ts.SyntaxKind.SuperKeyword ? 'super' : undefined;
}

function accessChain(expression: TypeScript.Expression): TypeScript.Expression[] {
  const chain = [expression];
  for (const node of chain) {
    if (ts.isPropertyAccessExpression(node)) {
      chain.push(node.expression);
    }
  }
  return chain;
}

function dottedAccessName(expression: TypeScript.Expression): string | undefined {
  const chain = accessChain(expression);
  const last = chain.at(-1);
  const root = last === undefined ? undefined : dottedAccessRoot(last);
  const parts = chain
    .slice(0, -1)
    .flatMap((node) => (ts.isPropertyAccessExpression(node) ? [node.name.text] : []))
    .reverse();
  return root === undefined ? undefined : [root, ...parts].join('.');
}

function identifierTarget(node: TypeScript.Node): Naming | undefined {
  return ts.isIdentifier(node) ? { name: node.text, containerName: undefined } : undefined;
}

function propertyAccessTarget(node: TypeScript.Node): Naming | undefined {
  if (!ts.isPropertyAccessExpression(node)) {
    return undefined;
  }
  const containerName = dottedAccessName(node.expression);
  return containerName ? { name: node.name.text, containerName } : undefined;
}

function elementAccessTarget(node: TypeScript.Node): Naming | undefined {
  if (!ts.isElementAccessExpression(node)) {
    return undefined;
  }
  const containerName = dottedAccessName(node.expression);
  return containerName
    ? { name: `[${node.argumentExpression.getText()}]`, containerName }
    : undefined;
}

function assignmentTarget(node: TypeScript.Node): Naming {
  return (
    firstResult([identifierTarget, propertyAccessTarget, elementAccessTarget], node) ?? {
      name: '<assigned>',
      containerName: undefined,
    }
  );
}

function isAssignment(node: TypeScript.Node): node is TypeScript.BinaryExpression {
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken;
}

function relativeSegment(name: string): Segment {
  return { name, anchored: false };
}

function variableSegment(parent: TypeScript.Node): Segment | undefined {
  return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
    ? relativeSegment(parent.name.text)
    : undefined;
}

function propertyAssignmentSegment(parent: TypeScript.Node): Segment | undefined {
  return ts.isPropertyAssignment(parent) ? relativeSegment(propertyName(parent.name)) : undefined;
}

function propertyDeclarationSegment(parent: TypeScript.Node): Segment | undefined {
  return ts.isPropertyDeclaration(parent) ? relativeSegment(propertyName(parent.name)) : undefined;
}

function assignmentSegment(parent: TypeScript.Node): Segment | undefined {
  if (!isAssignment(parent)) {
    return undefined;
  }
  const target = assignmentTarget(parent.left);
  return { name: displayName(target.containerName, target.name), anchored: true };
}

const OBJECT_SEGMENTS = [
  variableSegment,
  propertyAssignmentSegment,
  propertyDeclarationSegment,
  assignmentSegment,
];

function containerSegment(node: TypeScript.Node): Segment | undefined {
  if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name) {
    return relativeSegment(node.name.text);
  }
  return ts.isObjectLiteralExpression(node) ? firstResult(OBJECT_SEGMENTS, node.parent) : undefined;
}

export function containerNameFrom(start: TypeScript.Node): string | undefined {
  const segments: string[] = [];
  ts.findAncestor(start, (node) => {
    const segment = containerSegment(node);
    if (segment) {
      segments.unshift(segment.name);
    }
    return segment?.anchored === true;
  });
  return segments.length > 0 ? segments.join('.') : undefined;
}

function variableName(parent: TypeScript.Node): Naming | undefined {
  return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
    ? { name: parent.name.text, containerName: containerNameFrom(parent.parent) }
    : undefined;
}

function propertyAssignmentName(parent: TypeScript.Node): Naming | undefined {
  return ts.isPropertyAssignment(parent)
    ? { name: propertyName(parent.name), containerName: containerNameFrom(parent.parent) }
    : undefined;
}

function propertyDeclarationName(parent: TypeScript.Node): Naming | undefined {
  return ts.isPropertyDeclaration(parent)
    ? { name: propertyName(parent.name), containerName: containerNameFrom(parent.parent) }
    : undefined;
}

function assignmentName(parent: TypeScript.Node, node: TypeScript.Node): Naming | undefined {
  return isAssignment(parent) && parent.right === node ? assignmentTarget(parent.left) : undefined;
}

const ASSIGNED_NAMES = [
  variableName,
  propertyAssignmentName,
  propertyDeclarationName,
  assignmentName,
];

export function assignedFunctionName(node: TypeScript.Node): Naming | undefined {
  return firstResult(ASSIGNED_NAMES, node.parent, node);
}
