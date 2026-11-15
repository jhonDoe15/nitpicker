import type TypeScript from 'typescript';

export type Bindings = Map<TypeScript.Node, TypeScript.Node>;

export type FunctionLike =
  | TypeScript.ArrowFunction
  | TypeScript.FunctionExpression
  | TypeScript.FunctionDeclaration
  | TypeScript.MethodDeclaration;

export type Declaration =
  | TypeScript.ParameterDeclaration
  | TypeScript.VariableDeclaration
  | TypeScript.FunctionDeclaration
  | TypeScript.ClassDeclaration
  | TypeScript.ImportClause
  | TypeScript.ImportSpecifier;

export type OptionProperty = {
  readonly name: string | undefined;
  readonly value: TypeScript.Node;
  readonly node: TypeScript.Node;
};

export type Contract = {
  readonly callee: string;
  readonly optionsArgument: number;
  readonly sourceCallbacks: readonly string[];
  readonly correlatedCallbacks: readonly { readonly name: string; readonly inputIndex: number }[];
  readonly externalPublicationCallbacks: readonly string[];
  readonly snapshotReadMethods: readonly string[];
};

export type CallbackFinding = {
  readonly rule: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly callee: string;
};
