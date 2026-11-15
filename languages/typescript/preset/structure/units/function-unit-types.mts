import type TypeScript from 'typescript';

export type FunctionLike =
  | TypeScript.FunctionDeclaration
  | TypeScript.FunctionExpression
  | TypeScript.ArrowFunction
  | TypeScript.MethodDeclaration
  | TypeScript.ConstructorDeclaration
  | TypeScript.GetAccessorDeclaration
  | TypeScript.SetAccessorDeclaration;

export type Wrapper =
  | TypeScript.ParenthesizedExpression
  | TypeScript.AsExpression
  | TypeScript.SatisfiesExpression
  | TypeScript.NonNullExpression
  | TypeScript.TypeAssertion;

export type UnitContext = {
  readonly sourceFile: TypeScript.SourceFile;
  readonly anonymousCounts: Map<string, number>;
};

export type Unit = {
  readonly kind: string;
  readonly range: TypeScript.Node;
  readonly folded?: true;
};

export type UnitScope = { readonly scope: string[]; readonly unit?: Unit };

export type UnitFound = {
  readonly node: TypeScript.Node;
  readonly at: number;
  readonly name: string;
  readonly kind: string;
  readonly folded: boolean;
  readonly start: number;
  readonly end: number;
};
