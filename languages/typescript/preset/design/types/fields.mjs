import ts from 'typescript';
import { isFunctionValue } from '../syntax/function-values.mjs';
import {
  assignedNames,
  assignedValues,
  isMutableValue,
  isReadonlyTypeNode,
} from './mutable-values.mjs';

function isPropertyDeclaration(declaration) {
  return (
    declaration !== undefined &&
    (ts.isPropertyDeclaration(declaration) ||
      ts.isPropertySignature(declaration) ||
      ts.isParameter(declaration) ||
      ts.isBinaryExpression(declaration) ||
      ts.isPropertyAccessExpression(declaration))
  );
}

function initializerOf(declaration) {
  if (ts.isBinaryExpression(declaration)) {
    return declaration.right;
  }
  return ts.isPropertyAccessExpression(declaration) ? undefined : declaration.initializer;
}

function isPrivateMember(declaration) {
  const name = ts.getNameOfDeclaration(declaration);
  const modifiers = ts.getEffectiveModifierFlags(declaration);
  return (
    (name !== undefined && ts.isPrivateIdentifier(name)) ||
    (modifiers & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) !== 0
  );
}

function isFieldDeclaration(declaration) {
  return isPropertyDeclaration(declaration) && !isFunctionValue(initializerOf(declaration));
}

function nameOf(declaration) {
  return ts.getNameOfDeclaration(declaration)?.getText();
}

function fieldFact({ declaration, values }) {
  const name = nameOf(declaration);
  const own = [initializerOf(declaration), ...(values.get(name) ?? [])].filter(Boolean);
  const mutable =
    own.length > 0 && !isReadonlyTypeNode(declaration.type) && own.every(isMutableValue);
  return {
    name,
    ...(mutable ? { mutable } : {}),
    ...(isPrivateMember(declaration) ? { private: true } : {}),
  };
}

function ownedDeclaration({ registry }, property) {
  const declaration = property.valueDeclaration ?? property.declarations?.[0];
  const owned =
    declaration !== undefined && registry.owned.has(declaration.getSourceFile().fileName);
  return owned && isFieldDeclaration(declaration) ? declaration : undefined;
}

export function propertyFields(state, entry) {
  const type = state.checker.getTypeAtLocation(entry.node);
  const values = ts.isClassDeclaration(entry.node) ? assignedValues(entry.node) : new Map();
  return state.checker
    .getPropertiesOfType(type)
    .map((property) => ownedDeclaration(state, property))
    .filter((declaration) => declaration !== undefined && nameOf(declaration) !== undefined)
    .map((declaration) => fieldFact({ declaration, values }));
}

function variableFields(statement, { exported, assigned }) {
  const fields = [];
  const kinds = statement.declarationList.flags & ts.NodeFlags.Const;
  for (const declaration of statement.declarationList.declarations) {
    if (isFunctionValue(declaration.initializer)) {
      continue;
    }
    for (const name of bindingNames(declaration.name)) {
      const mutable =
        isMutableValue(declaration.initializer) && (kinds !== 0 || !assigned.has(name.text));
      fields.push({
        name: name.text,
        ...(mutable ? { mutable } : {}),
        ...(exported.has(declaration) ? {} : { private: true }),
      });
    }
  }
  return fields;
}

function bindingNames(name) {
  const names = [];
  const pending = [name];
  for (const node of pending) {
    if (ts.isIdentifier(node)) {
      names.push(node);
    } else {
      pending.push(...node.elements.filter(ts.isBindingElement).map((element) => element.name));
    }
  }
  return names;
}

export function moduleFields(sourceFile, exported) {
  const assigned = assignedNames(sourceFile);
  return sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => variableFields(statement, { exported, assigned }));
}
