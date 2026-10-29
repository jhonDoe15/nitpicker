import ts from 'typescript';
import { locationOf } from './program.mjs';

function importDeclarationOf(node) {
  return ts.findAncestor(node, ts.isImportDeclaration);
}

function importExpr(declaration) {
  const module = importDeclarationOf(declaration).moduleSpecifier.text;
  if (ts.isImportSpecifier(declaration)) {
    return { kind: 'import', module, name: (declaration.propertyName ?? declaration.name).text };
  }
  return { kind: 'import', module, name: ts.isNamespaceImport(declaration) ? '*' : 'default' };
}

function isTopLevel(declaration) {
  return ts.findAncestor(declaration.parent, ts.isFunctionLike) === undefined;
}

function literalValue(node) {
  const inner = ts.isAsExpression(node) || ts.isSatisfiesExpression(node) ? node.expression : node;
  if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) {
    return { value: inner.text };
  }
  return ts.isNumericLiteral(inner) ? { value: Number(inner.text) } : undefined;
}

function enumMembers(declaration) {
  const members = {};
  for (const member of declaration.members) {
    const value = member.initializer === undefined ? undefined : literalValue(member.initializer);
    if (value !== undefined && ts.isIdentifier(member.name)) {
      members[member.name.text] = value.value;
    }
  }
  return members;
}

function isConstAssertion(node) {
  return ts.isAsExpression(node) && ts.isConstTypeReference(node.type);
}

function objectMembers(initializer) {
  if (!isConstAssertion(initializer) || !ts.isObjectLiteralExpression(initializer.expression)) {
    return undefined;
  }
  const { properties } = initializer.expression;
  const plain = properties.every(
    (property) => ts.isPropertyAssignment(property) && ts.isIdentifier(property.name),
  );
  if (!plain) {
    return undefined;
  }
  const members = new Map();
  for (const property of properties) {
    members.set(property.name.text, literalValue(property.initializer));
  }
  return Object.fromEntries(
    [...members]
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value.value]),
  );
}

function isFunctionValue(initializer) {
  return (
    initializer !== undefined &&
    (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
  );
}

function isObjectValue(initializer) {
  const inner = isConstAssertion(initializer) ? initializer.expression : initializer;
  return ts.isObjectLiteralExpression(inner) || ts.isArrayLiteralExpression(inner);
}

function variableBinding(declaration, node, cx) {
  const name = declaration.name.text;
  const { initializer } = declaration;
  if (
    (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) === 0 ||
    initializer === undefined
  ) {
    return outerUnsupported(node, cx, 'mutable-module-binding');
  }
  if (isFunctionValue(initializer)) {
    return { kind: 'helper', name };
  }
  const literal = literalValue(initializer);
  if (literal !== undefined) {
    return { kind: 'lit', value: literal.value, via: name };
  }
  const members = objectMembers(initializer);
  return {
    kind: 'module',
    name,
    object: isObjectValue(initializer),
    ...(members === undefined ? {} : { members }),
  };
}

function outerUnsupported(node, cx, syntax) {
  const loc = locationOf(cx.sourceFile, node);
  return { kind: 'unsupported', syntax, hasCall: false, mutates: false, clobbers: [], loc };
}

export function moduleBinding(declaration, node, cx) {
  if (importDeclarationOf(declaration) !== undefined) {
    return importExpr(declaration);
  }
  if (!isTopLevel(declaration)) {
    return outerUnsupported(node, cx, 'outer-binding');
  }
  if (ts.isFunctionDeclaration(declaration)) {
    return { kind: 'helper', name: declaration.name.text };
  }
  if (ts.isEnumDeclaration(declaration)) {
    const name = declaration.name.text;
    return { kind: 'module', name, object: true, members: enumMembers(declaration) };
  }
  const plain = ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name);
  return plain
    ? variableBinding(declaration, node, cx)
    : { kind: 'module', name: node.text, object: ts.isClassDeclaration(declaration) };
}

export function findFunction(sourceFile, name) {
  for (const statement of sourceFile.statements) {
    const named = ts.isFunctionDeclaration(statement) && statement.name?.text === name;
    if (named && statement.body !== undefined) {
      return statement;
    }
    const declarations = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations
      : [];
    const match = declarations.find(
      (item) => ts.isIdentifier(item.name) && item.name.text === name,
    );
    if (match !== undefined && isFunctionValue(match.initializer)) {
      return match.initializer;
    }
  }
  return undefined;
}
