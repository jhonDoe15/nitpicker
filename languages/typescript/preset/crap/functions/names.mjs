import ts from 'typescript';

function firstResult(resolvers, ...inputs) {
  for (const resolve of resolvers) {
    const result = resolve(...inputs);
    if (result) {
      return result;
    }
  }
  return undefined;
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
  return node.kind === ts.SyntaxKind.SuperKeyword ? 'super' : undefined;
}

function accessChain(expression) {
  const chain = [expression];
  for (const node of chain) {
    if (ts.isPropertyAccessExpression(node)) {
      chain.push(node.expression);
    }
  }
  return chain;
}

function dottedAccessName(expression) {
  const chain = accessChain(expression);
  const root = dottedAccessRoot(chain.at(-1));
  const parts = chain
    .slice(0, -1)
    .map((node) => node.name.text)
    .reverse();
  return root === undefined ? undefined : [root, ...parts].join('.');
}

function identifierTarget(node) {
  return ts.isIdentifier(node) ? { name: node.text, containerName: undefined } : undefined;
}

function propertyAccessTarget(node) {
  if (!ts.isPropertyAccessExpression(node)) {
    return undefined;
  }
  const containerName = dottedAccessName(node.expression);
  return containerName ? { name: node.name.text, containerName } : undefined;
}

function elementAccessTarget(node) {
  if (!ts.isElementAccessExpression(node)) {
    return undefined;
  }
  const containerName = dottedAccessName(node.expression);
  return containerName
    ? { name: `[${node.argumentExpression.getText()}]`, containerName }
    : undefined;
}

function assignmentTarget(node) {
  return (
    firstResult([identifierTarget, propertyAccessTarget, elementAccessTarget], node) ?? {
      name: '<assigned>',
      containerName: undefined,
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
    : undefined;
}

function propertyAssignmentSegment(parent) {
  return ts.isPropertyAssignment(parent) ? relativeSegment(propertyName(parent.name)) : undefined;
}

function propertyDeclarationSegment(parent) {
  return ts.isPropertyDeclaration(parent) ? relativeSegment(propertyName(parent.name)) : undefined;
}

function assignmentSegment(parent) {
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

function containerSegment(node) {
  if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name) {
    return relativeSegment(node.name.text);
  }
  return ts.isObjectLiteralExpression(node) ? firstResult(OBJECT_SEGMENTS, node.parent) : undefined;
}

export function containerNameFrom(start) {
  const segments = [];
  ts.findAncestor(start, (node) => {
    const segment = containerSegment(node);
    if (segment) {
      segments.unshift(segment.name);
    }
    return segment?.anchored === true;
  });
  return segments.length > 0 ? segments.join('.') : undefined;
}

function variableName(parent) {
  return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
    ? { name: parent.name.text, containerName: containerNameFrom(parent.parent) }
    : undefined;
}

function propertyAssignmentName(parent) {
  return ts.isPropertyAssignment(parent)
    ? { name: propertyName(parent.name), containerName: containerNameFrom(parent.parent) }
    : undefined;
}

function propertyDeclarationName(parent) {
  return ts.isPropertyDeclaration(parent)
    ? { name: propertyName(parent.name), containerName: containerNameFrom(parent.parent) }
    : undefined;
}

function assignmentName(parent, node) {
  return isAssignment(parent) && parent.right === node ? assignmentTarget(parent.left) : undefined;
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
