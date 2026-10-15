import ts from 'typescript';

function firstResult(resolvers, ...inputs) {
  for (const resolve of resolvers) {
    const result = resolve(...inputs);
    if (result) {
      return result;
    }
  }
  return null;
}

export function propertyName(name) {
  if (ts.isPrivateIdentifier(name)) {
    return name.getText();
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
}

export function displayName(containerName, functionName) {
  if (!containerName) {
    return functionName;
  }
  return functionName.startsWith('[')
    ? `${containerName}${functionName}`
    : `${containerName}.${functionName}`;
}

function dottedAccessRoot(node) {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (node.kind === ts.SyntaxKind.ThisKeyword) {
    return 'this';
  }
  return node.kind === ts.SyntaxKind.SuperKeyword ? 'super' : null;
}

function dottedAccessName(expression) {
  const parts = [];
  let current = expression;
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
  }
  const root = dottedAccessRoot(current);
  return root === null ? null : [root, ...parts].join('.');
}

function identifierTarget(node) {
  return ts.isIdentifier(node) ? { name: node.text, containerName: null } : null;
}

function propertyAccessTarget(node) {
  if (!ts.isPropertyAccessExpression(node)) {
    return null;
  }
  const containerName = dottedAccessName(node.expression);
  return containerName ? { name: node.name.text, containerName } : null;
}

function elementAccessTarget(node) {
  if (!ts.isElementAccessExpression(node)) {
    return null;
  }
  const containerName = dottedAccessName(node.expression);
  return containerName ? { name: `[${node.argumentExpression.getText()}]`, containerName } : null;
}

function assignmentTarget(node) {
  return (
    firstResult([identifierTarget, propertyAccessTarget, elementAccessTarget], node) ?? {
      name: '<assigned>',
      containerName: null,
    }
  );
}

function isAssignment(node) {
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken;
}

function relativeSegment(name) {
  return { name, anchored: false };
}

function variableSegment(parent) {
  return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
    ? relativeSegment(parent.name.text)
    : null;
}

function propertyAssignmentSegment(parent) {
  return ts.isPropertyAssignment(parent) ? relativeSegment(propertyName(parent.name)) : null;
}

function propertyDeclarationSegment(parent) {
  return ts.isPropertyDeclaration(parent) ? relativeSegment(propertyName(parent.name)) : null;
}

function assignmentSegment(parent) {
  if (!isAssignment(parent)) {
    return null;
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

function containerSegment(node) {
  if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name) {
    return relativeSegment(node.name.text);
  }
  return ts.isObjectLiteralExpression(node) ? firstResult(OBJECT_SEGMENTS, node.parent) : null;
}

export function containerNameFrom(start) {
  const segments = [];
  let current = start;
  while (current) {
    const segment = containerSegment(current);
    if (segment) {
      segments.unshift(segment.name);
    }
    current = segment?.anchored ? undefined : current.parent;
  }
  return segments.length > 0 ? segments.join('.') : null;
}

function variableName(parent) {
  return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
    ? { name: parent.name.text, containerName: containerNameFrom(parent.parent) }
    : null;
}

function propertyAssignmentName(parent) {
  return ts.isPropertyAssignment(parent)
    ? { name: propertyName(parent.name), containerName: containerNameFrom(parent.parent) }
    : null;
}

function propertyDeclarationName(parent) {
  return ts.isPropertyDeclaration(parent)
    ? { name: propertyName(parent.name), containerName: containerNameFrom(parent.parent) }
    : null;
}

function assignmentName(parent, node) {
  return isAssignment(parent) && parent.right === node ? assignmentTarget(parent.left) : null;
}

const ASSIGNED_NAMES = [
  variableName,
  propertyAssignmentName,
  propertyDeclarationName,
  assignmentName,
];

export function assignedFunctionName(node) {
  return firstResult(ASSIGNED_NAMES, node.parent, node);
}
