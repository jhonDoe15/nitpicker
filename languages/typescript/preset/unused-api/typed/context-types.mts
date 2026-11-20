import type TypeScript from 'typescript';
import type { PackagesInfo, PublishableEntry } from '../workspace/workspace-types.mts';

type FileRole = 'production' | 'support';

export type FileInfo = {
  readonly path: string;
  readonly package: PublishableEntry | undefined;
  readonly packageDir: string | undefined;
  readonly role: FileRole;
  readonly insideProject: boolean;
};

export type Passes = { all: boolean; readonly names: Set<string> };

export type ReferenceKindName = 'call' | 'escape' | 'defaults';

export type Reference = {
  readonly kind: ReferenceKindName;
  readonly passes: Passes | undefined;
  readonly role: FileRole;
  readonly packageDir: string | undefined;
};

export type TargetBase = {
  readonly name: string;
  readonly path: string;
  readonly package: PublishableEntry | undefined;
  readonly refs: Reference[];
  readonly members: Map<string, TypeScript.Declaration>;
  readonly index: number;
};

export type Target = TargetBase & { readonly kind: 'component' | 'function' };

export type Registry = {
  readonly byDeclaration: ReadonlyMap<TypeScript.Node, Target>;
  readonly targets: readonly Target[];
  readonly names: ReadonlySet<string>;
  readonly cloned: Reference[];
  readonly register: (target: Target, keyNodes: readonly TypeScript.Node[]) => void;
  readonly alias: (target: Target, node: TypeScript.Node, name: string) => void;
};

export type Candidate = {
  readonly name: string;
  readonly fn:
    TypeScript.FunctionDeclaration | TypeScript.ArrowFunction | TypeScript.FunctionExpression;
  readonly keyNodes: readonly TypeScript.Node[];
};

export type Context = {
  readonly program: TypeScript.Program;
  readonly checker: TypeScript.TypeChecker;
  readonly files: readonly TypeScript.SourceFile[];
  readonly fileInfo: ReadonlyMap<string, FileInfo>;
  readonly owned: ReadonlyMap<string, FileInfo>;
};

export type TargetContext = Context & { readonly react: boolean };

export type ContextLayout = {
  readonly javascript: boolean;
  isTestFile(file: string): boolean;
  isTestFixture(file: string, name?: string): boolean;
  isSourceFile(file: string): boolean;
};

export type ContextOptions = {
  readonly program: TypeScript.Program;
  readonly projectRoot: string;
  readonly layout: ContextLayout;
  readonly packagesInfo: PackagesInfo;
};

export type NamedType = TypeScript.TypeAliasDeclaration | TypeScript.InterfaceDeclaration;

export type FileState = TargetContext & {
  readonly registry: Registry;
  readonly sourceFile: TypeScript.SourceFile;
  readonly file: FileInfo;
};

export type ReferenceState = FileState & {
  readonly names: ReadonlySet<string>;
  readonly namespaces: ReadonlySet<string>;
  readonly consumed: { has(node: TypeScript.Node): boolean };
  readonly consume: (node: TypeScript.Node) => void;
};
