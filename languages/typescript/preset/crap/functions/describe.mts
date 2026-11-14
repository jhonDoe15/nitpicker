import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import type { FunctionDescriptor, Span } from '../crap-types.mts';
import {
  cyclomaticComplexity,
  expectsBranchCoverage,
  expectsStatementCoverage,
} from './complexity.mts';
import {
  assignedFunctionName,
  containerNameFrom,
  displayName,
  propertyName,
  type Naming,
} from './names.mts';
import { appendAll, childrenOf } from './own-nodes.mts';

const ts = typescriptApi();

type BodiedNode = TypeScript.Node & { readonly body: TypeScript.Node };

function startOf(sourceFile: TypeScript.SourceFile, node: TypeScript.Node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
}

function bodySpan(sourceFile: TypeScript.SourceFile, body: TypeScript.Node): Span {
  const start = startOf(sourceFile, body);
  const end = sourceFile.getLineAndCharacterOfPosition(body.end);
  return {
    startLine: start.line + 1,
    startColumn: start.character,
    endLine: end.line + 1,
    endColumn: end.character,
  };
}

function lastBodyLine(sourceFile: TypeScript.SourceFile, body: TypeScript.Node): number {
  const last = Math.max(body.end - 1, body.getStart(sourceFile));
  return sourceFile.getLineAndCharacterOfPosition(last).line + 1;
}

function descriptorOf(
  sourceFile: TypeScript.SourceFile,
  node: BodiedNode,
  naming: Naming,
): FunctionDescriptor {
  const functionName = naming.name;
  return {
    functionName,
    containerName: naming.containerName,
    displayName: displayName(naming.containerName, functionName),
    startLine: startOf(sourceFile, node).line + 1,
    endLine: lastBodyLine(sourceFile, node.body),
    complexity: cyclomaticComplexity(node),
    bodySpan: bodySpan(sourceFile, node.body),
    expectsStatementCoverage: expectsStatementCoverage(node.body),
    expectsBranchCoverage: expectsBranchCoverage(node.body),
  };
}

function declaredFunctionName(node: TypeScript.FunctionDeclaration): string | undefined {
  if (node.name) {
    return node.name.text;
  }
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ? 'default'
    : undefined;
}

function memberName(node: TypeScript.Node): string | undefined {
  if (ts.isFunctionDeclaration(node)) {
    return declaredFunctionName(node);
  }
  if (ts.isMethodDeclaration(node)) {
    return propertyName(node.name);
  }
  if (ts.isConstructorDeclaration(node)) {
    return 'constructor';
  }
  if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    return `${ts.isGetAccessorDeclaration(node) ? 'get' : 'set'} ${propertyName(node.name)}`;
  }
  return undefined;
}

function namingOf(node: TypeScript.Node): Naming | undefined {
  const name = memberName(node);
  if (name !== undefined) {
    return { name, containerName: containerNameFrom(node.parent) };
  }
  return ts.isFunctionExpression(node) || ts.isArrowFunction(node)
    ? assignedFunctionName(node)
    : undefined;
}

function hasBody(node: TypeScript.Node): node is BodiedNode {
  return ts.isArrowFunction(node) || ('body' in node && node.body !== undefined);
}

function describeNode(
  sourceFile: TypeScript.SourceFile,
  node: TypeScript.Node,
): FunctionDescriptor | undefined {
  if (!hasBody(node)) {
    return undefined;
  }
  const naming = namingOf(node);
  return naming ? descriptorOf(sourceFile, node, naming) : undefined;
}

export function describeFunctions(sourceFile: TypeScript.SourceFile): FunctionDescriptor[] {
  const nodes: TypeScript.Node[] = [sourceFile];
  for (const node of nodes) {
    appendAll(nodes, childrenOf(node));
  }
  return nodes
    .sort((left, right) => left.pos - right.pos)
    .map((node) => describeNode(sourceFile, node))
    .filter((descriptor) => descriptor !== undefined);
}
