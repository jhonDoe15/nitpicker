import type TypeScript from 'typescript';

export type TreeNode = {
  readonly kind: string;
  readonly children: readonly Converted[];
  readonly value?: string;
  readonly text?: string;
  readonly literal?: string;
  readonly binding?: string;
  readonly start?: number;
  readonly end?: number;
};

export type Converted = TreeNode | readonly Converted[];

export type Shape = Omit<TreeNode, 'children' | 'start' | 'end'>;

export type LambdaSource = TypeScript.FunctionLikeDeclaration;

export type TextContext = { readonly sourceFile: TypeScript.SourceFile };

export type TreeContext = TextContext & {
  readonly imported: ReadonlyMap<string, string>;
  readonly get: (source: TypeScript.Node) => Converted;
  readonly lambda: (source: LambdaSource) => TreeNode;
  readonly name: (text: string, source: TypeScript.Node) => TreeNode;
  readonly typeOf: (type: TypeScript.TypeNode | undefined) => TreeNode;
};

export type Converter = (source: TypeScript.Node, context: TreeContext) => Converted;

export type ConverterTable = Readonly<Partial<Record<TypeScript.SyntaxKind, Converter>>>;

export type SharedContext = TextContext & { readonly imported: ReadonlyMap<string, string> };

export type NearDuplicateUnit = {
  readonly name: string;
  readonly start: number | undefined;
  readonly end: number | undefined;
  readonly tokens: number;
  readonly final: boolean;
  readonly tree: TreeNode;
};

export type UnitContext = SharedContext & Pick<TreeContext, 'name' | 'typeOf'>;

export type UnitFact = NearDuplicateUnit & { readonly id: string; readonly file: string };

export type UnitRoot = { readonly node: LambdaSource; readonly label: string };
