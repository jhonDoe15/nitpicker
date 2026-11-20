import type TypeScript from 'typescript';
import type { fileExports, fileImports } from '../../../syntax/module-facts.mts';

type Nodes = TypeScript.NodeArray<TypeScript.Node>;

export type PartsNode = TypeScript.Node & {
  readonly typeParameters?: Nodes | undefined;
  readonly typeArguments?: Nodes | undefined;
  readonly parameters?: Nodes | undefined;
  readonly heritageClauses?: Nodes | undefined;
  readonly members?: Nodes | undefined;
  readonly type?: TypeScript.Node | undefined;
  readonly initializer?: TypeScript.Node | undefined;
  readonly body?: TypeScript.Node | undefined;
};

export type NamedStatement = TypeScript.Statement & {
  readonly name?: (TypeScript.Node & { readonly text: string }) | undefined;
};

export type ImportFact = ReturnType<typeof fileImports>[number];

export type ExportFacts = ReturnType<typeof fileExports>;

export type Binding =
  | { readonly kind: 'import'; readonly specifier: string; readonly imported: string }
  | { readonly kind: 'local'; readonly text: string };

export type Lookup = (name: string) => Binding | undefined;

export type FreeBinding = { readonly name: string; readonly binding: Binding };

export type Definition = {
  readonly name: string;
  readonly kind: string;
  readonly text: string;
  readonly tokens: readonly string[];
  readonly untypedTokens: readonly string[];
  readonly free: readonly FreeBinding[];
  readonly size: number;
  readonly exported: boolean;
  readonly isDefault: boolean;
  readonly literal: boolean;
  readonly component: boolean;
  readonly line: number;
  readonly lines: number;
  readonly span: readonly [number, number];
};

export type DefinitionFact = Definition & { readonly usedLocally: boolean };

export type Spec = {
  readonly name: string;
  readonly statement: TypeScript.Statement;
  readonly exported: boolean;
  readonly isDefault: boolean;
  readonly kind: string;
  readonly tag: string;
  readonly node: PartsNode;
  readonly overloads?: readonly PartsNode[] | undefined;
  readonly annotation?: TypeScript.Node | undefined;
  readonly literal: boolean;
  readonly component: boolean;
};
