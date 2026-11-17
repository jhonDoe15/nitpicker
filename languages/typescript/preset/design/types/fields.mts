import type {
  ArrayBindingElement,
  BindingName,
  Expression,
  Identifier,
  Node,
  SourceFile,
  TypeNode,
  VariableStatement,
  Symbol as TsSymbol,
} from 'typescript';
import { ts } from '../syntax/typed.mts';
import type { State, TypeEntry } from '../design-types.mts';
import type { FieldDeclaration, FieldFact } from './field-types.mts';
import { isFunctionValue } from '../syntax/function-values.mts';
import {
  assignedNames,
  assignedValues,
  isMutableValue,
  isReadonlyTypeNode,
} from './mutable-values.mts';
import { appendAll } from '../../../../../shared/lists/lists.mts';

function isPropertyDeclaration(declaration: Node | undefined): declaration is FieldDeclaration {
  return (
    declaration !== undefined &&
    (ts.isPropertyDeclaration(declaration) ||
      ts.isPropertySignature(declaration) ||
      ts.isParameter(declaration) ||
      ts.isBinaryExpression(declaration) ||
      ts.isPropertyAccessExpression(declaration))
  );
}

function initializerOf(declaration: FieldDeclaration): Expression | undefined {
  if (ts.isBinaryExpression(declaration)) {
    return declaration.right;
  }
  return ts.isPropertyAccessExpression(declaration) || ts.isPropertySignature(declaration)
    ? undefined
    : declaration.initializer;
}

function isPrivateMember(declaration: FieldDeclaration): boolean {
  const name = ts.getNameOfDeclaration(declaration);
  const modifiers = ts.getEffectiveModifierFlags(declaration);
  return (
    (name !== undefined && ts.isPrivateIdentifier(name)) ||
    (modifiers & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) !== 0
  );
}

function isFieldDeclaration(declaration: Node | undefined): declaration is FieldDeclaration {
  return isPropertyDeclaration(declaration) && !isFunctionValue(initializerOf(declaration));
}

function nameOf(declaration: FieldDeclaration): string | undefined {
  return ts.getNameOfDeclaration(declaration)?.getText();
}

function typeOf(declaration: FieldDeclaration): TypeNode | undefined {
  return ts.isBinaryExpression(declaration) || ts.isPropertyAccessExpression(declaration)
    ? undefined
    : declaration.type;
}

function fieldFact({
  declaration,
  name,
  values,
}: {
  declaration: FieldDeclaration;
  name: string;
  values: ReadonlyMap<string, readonly Expression[]>;
}): FieldFact {
  const own = [initializerOf(declaration), ...(values.get(name) ?? [])].filter(Boolean);
  const mutable =
    own.length > 0 && !isReadonlyTypeNode(typeOf(declaration)) && own.every(isMutableValue);
  return {
    name,
    ...(mutable ? { mutable } : {}),
    ...(isPrivateMember(declaration) ? { private: true } : {}),
  };
}

function ownedDeclaration(
  { registry }: Pick<State, 'registry'>,
  property: TsSymbol,
): FieldDeclaration | undefined {
  const declaration = property.valueDeclaration ?? property.declarations?.[0];
  const owned =
    declaration !== undefined && registry.owned.has(declaration.getSourceFile().fileName);
  return owned && isFieldDeclaration(declaration) ? declaration : undefined;
}

export function propertyFields(state: State, entry: TypeEntry): FieldFact[] {
  const type = state.checker.getTypeAtLocation(entry.node);
  const values = ts.isClassDeclaration(entry.node) ? assignedValues(entry.node) : new Map();
  return state.checker
    .getPropertiesOfType(type)
    .map((property) => ownedDeclaration(state, property))
    .flatMap((declaration) => {
      const name = declaration === undefined ? undefined : nameOf(declaration);
      return declaration === undefined || name === undefined
        ? []
        : [fieldFact({ declaration, name, values })];
    });
}

function variableFields(
  statement: VariableStatement,
  { exported, assigned }: { exported: ReadonlySet<Node>; assigned: ReadonlySet<string> },
): FieldFact[] {
  const fields: FieldFact[] = [];
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

function bindingNames(name: BindingName): Identifier[] {
  const names: Identifier[] = [];
  const pending = [name];
  for (const node of pending) {
    if (ts.isIdentifier(node)) {
      names.push(node);
    } else {
      const elements: readonly ArrayBindingElement[] = node.elements;
      appendAll(
        pending,
        elements.filter(ts.isBindingElement).map((element) => element.name),
      );
    }
  }
  return names;
}

export function moduleFields(sourceFile: SourceFile, exported: ReadonlySet<Node>): FieldFact[] {
  const assigned = assignedNames(sourceFile);
  return sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => variableFields(statement, { exported, assigned }));
}
