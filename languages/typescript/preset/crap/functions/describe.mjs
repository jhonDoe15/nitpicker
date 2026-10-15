import ts from 'typescript';
import {
  cyclomaticComplexity,
  expectsBranchCoverage,
  expectsStatementCoverage,
} from './complexity.mjs';
import { assignedFunctionName, containerNameFrom, displayName, propertyName } from './names.mjs';
import { childrenOf } from './own-nodes.mjs';

function startOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
}

function bodySpan(sourceFile, body) {
  const start = startOf(sourceFile, body);
  const end = sourceFile.getLineAndCharacterOfPosition(body.end);
  return {
    startLine: start.line + 1,
    startColumn: start.character,
    endLine: end.line + 1,
    endColumn: end.character,
  };
}

function lastBodyLine(sourceFile, body) {
  const last = Math.max(body.end - 1, body.getStart(sourceFile));
  return sourceFile.getLineAndCharacterOfPosition(last).line + 1;
}

function descriptorOf(sourceFile, node, naming) {
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

function declaredFunctionName(node) {
  if (node.name) {
    return node.name.text;
  }
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ? 'default'
    : null;
}

function memberName(node) {
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
  return null;
}

function namingOf(node) {
  const name = memberName(node);
  if (name !== null) {
    return { name, containerName: containerNameFrom(node.parent) };
  }
  return ts.isFunctionExpression(node) || ts.isArrowFunction(node)
    ? assignedFunctionName(node)
    : null;
}

function describeNode(sourceFile, node) {
  const hasBody = ts.isArrowFunction(node) || node.body !== undefined;
  const naming = hasBody ? namingOf(node) : null;
  return naming ? descriptorOf(sourceFile, node, naming) : null;
}

export function describeFunctions(sourceFile) {
  const descriptors = [];
  const pending = [sourceFile];
  while (pending.length > 0) {
    const node = pending.pop();
    const descriptor = describeNode(sourceFile, node);
    if (descriptor) {
      descriptors.push(descriptor);
    }
    pending.push(...childrenOf(node).reverse());
  }
  return descriptors;
}
