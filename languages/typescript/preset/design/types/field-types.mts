import type {
  BinaryExpression,
  ParameterDeclaration,
  PropertyAccessExpression,
  PropertyDeclaration,
  PropertySignature,
} from 'typescript';

export type FieldDeclaration =
  | PropertyDeclaration
  | PropertySignature
  | ParameterDeclaration
  | BinaryExpression
  | PropertyAccessExpression;

export type FieldFact = { name: string; mutable?: true; private?: true };
