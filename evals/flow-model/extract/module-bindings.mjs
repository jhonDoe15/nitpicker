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

function objectMembers(initializer) {
  const inner = ts.isAsExpression(initializer) ? initializer.expression : initializer;
  if (!ts.isObjectLiteralExpression(inner)) {
    return undefined;
  }
  const members = {};
  for (const property of inner.properties.filter(ts.isPropertyAssignment)) {
    const value = literalValue(property.initializer);
    if (value !== undefined && ts.isIdentifier(property.name)) {
      members[property.name.text] = value.value;
    }
  }
  return members;
}

function isFunctionValue(initializer) {
  return (
    initializer !== undefined &&
    (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
  );
}

function variableBinding(declaration) {
  const name = declaration.name.text;
  const initializer = declaration.initializer;
  if (isFunctionValue(initializer)) {
    return { kind: 'helper', name };
  }
  const literal = initializer === undefined ? undefined : literalValue(initializer);
  if (literal !== undefined) {
    return { kind: 'lit', value: literal.value, via: name };
  }
  const members = initializer === undefined ? undefined : objectMembers(initializer);
  return { kind: 'module', name, ...(members === undefined ? {} : { members }) };
}

export function moduleBinding(declaration, node, cx) {
  if (importDeclarationOf(declaration) !== undefined) {
    return importExpr(declaration);
  }
  if (!isTopLevel(declaration)) {
    return {
      kind: 'unsupported',
      syntax: 'outer-binding',
      hasCall: false,
      loc: locationOf(cx.sourceFile, node),
    };
  }
  if (ts.isFunctionDeclaration(declaration)) {
    return { kind: 'helper', name: declaration.name.text };
  }
  if (ts.isEnumDeclaration(declaration)) {
    return { kind: 'module', name: declaration.name.text, members: enumMembers(declaration) };
  }
  const plain = ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name);
  return plain ? variableBinding(declaration) : { kind: 'module', name: node.text };
}

export function findFunction(sourceFile, name) {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
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
