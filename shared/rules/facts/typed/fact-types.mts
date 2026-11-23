import type { TreeNode } from '../../../near-duplicates/tree/tree-types.mts';

export type ImportName = { readonly name: string; readonly alias?: string | undefined };

export type FactModule = {
  readonly file: string;
  readonly role: string;
  readonly entry?: true | false;
  readonly publicNames?: readonly string[];
  readonly entryName?: string;
  readonly compositionRoot?: true | false;
  readonly persistence?: string | undefined;
  readonly generated?: true | false;
  readonly initializer?: true | false;
};

export type FactPackage = { readonly root: string; readonly published: boolean };

export type FactDefinition = {
  readonly file: string;
  readonly name: string;
  readonly kind: string;
  readonly line: number;
  readonly exported: boolean;
  readonly tokens: readonly string[];
  readonly untypedTokens?: readonly string[] | undefined;
  readonly qualifier?: string | undefined;
  readonly lines?: number;
  readonly size?: number;
  readonly literal?: true | false;
  readonly usedLocally?: true | false;
  readonly exportNames?: readonly string[];
  readonly key?: string;
  readonly text?: string;
  readonly entry?: true | false;
  readonly overloads?: true | false;
  readonly package?: string | undefined;
};

export type FactImport = {
  readonly from: string;
  readonly to: string;
  readonly names: readonly ImportName[];
  readonly reexport?: true | false;
  readonly typeOnly?: true | false;
  readonly conditional?: true | false;
  readonly reference?: true | false;
  readonly local?: true | false;
  readonly role?: string;
};

export type FactConsoleEntry = {
  readonly file: string;
  readonly test: string;
  readonly messages: readonly string[];
};

export type FactDocComment = {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  readonly qualifier?: string | undefined;
  readonly lines: readonly string[];
  readonly detailed?: true | false;
};

export type FactUnit = {
  readonly file: string;
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly tokens: number;
  readonly final: boolean;
  readonly tree: TreeNode;
};

export type Facts = {
  readonly modules?: readonly FactModule[];
  readonly packages?: readonly FactPackage[];
  readonly definitions?: readonly FactDefinition[];
  readonly imports?: readonly FactImport[];
  readonly docComments?: readonly FactDocComment[];
  readonly console?: readonly FactConsoleEntry[];
  readonly nearDuplicateUnits?: readonly FactUnit[];
  readonly [list: string]: unknown;
};

export type RuleContext = {
  readonly analyzerName: string;
  readonly isExcepted: (rule: string, ...candidates: string[]) => boolean;
};

export type BaselineFile = {
  readonly unchanged: boolean;
  readonly definitions: readonly (FactDefinition & { readonly text: string })[];
};

export type BaselineSource = (file: string) => BaselineFile;
