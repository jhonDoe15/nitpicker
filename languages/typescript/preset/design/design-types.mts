import type TypeScript from 'typescript';

type Node = TypeScript.Node;

export type TypeKind = 'module' | 'class' | 'data' | 'enum' | 'interface';

export type OwnedFile = {
  readonly sourceFile: TypeScript.SourceFile;
  readonly path: string;
  readonly exported: ReadonlySet<Node>;
};

export type TypeEntry = {
  id: string;
  file: string;
  name: string;
  node: Node;
  kind: TypeKind;
  exported: boolean;
  anchor?: Node | undefined;
  cases?: string[];
  implemented?: true;
  fieldNames: Set<string>;
};

export type SiteNode = TypeScript.FunctionLikeDeclaration | TypeScript.MethodSignature;

export type SiteMember = TypeScript.ClassElement | TypeScript.TypeElement;

export type Site = {
  id: string;
  name: string;
  kind: 'function' | 'method' | 'constructor' | 'accessor';
  owner?: string;
  node: SiteNode;
  declaration: Node;
  file: OwnedFile;
  exported: boolean;
  anchor?: Node | undefined;
  line: number;
  callback?: true;
  member?: SiteMember;
  classEntry?: TypeEntry;
  isStatic?: true;
  bodyless?: true;
};

export type Registry = {
  readonly owned: ReadonlySet<string>;
  readonly entries: TypeEntry[];
  readonly typeIds: Map<string, TypeEntry>;
  readonly typeByNode: Map<Node, TypeEntry>;
  readonly exportedByFile: Map<string, ReadonlySet<Node>>;
  readonly sites: Site[];
  readonly siteCounts: Map<string, number>;
  readonly siteNames: Set<string>;
  readonly siteByNode: Map<Node, Site>;
  readonly constructorByClass: Map<Node, Site | undefined>;
  readonly importsByFile: Map<TypeScript.SourceFile, Set<string>>;
  readonly classNames: Set<string>;
  readonly enumNames: Set<string>;
  readonly fieldNames: Set<string>;
  readonly enumCases: Set<string>;
  readonly constantNames: Set<string>;
  readonly heldByConstant: Map<Node, Site[]>;
};

export type State = {
  readonly checker: TypeScript.TypeChecker;
  readonly mayBeProjectModule: (specifier: string) => boolean;
  readonly frameworkDefaults: readonly { test: (file: string) => boolean }[];
  readonly registry: Registry;
};

export type Scope = State & {
  readonly site: Site;
  readonly sourceFile: TypeScript.SourceFile;
  readonly nodes: Node[];
  readonly keys: Map<TypeScript.Symbol, string>;
  readonly nameCounts: Map<string, number>;
};

export type Fact = Readonly<Record<string, unknown>>;

export type TypeFact = {
  id: string;
  file: string;
  name: string;
  line: number;
  kind: TypeKind;
  exported: boolean;
  fields?: readonly { name: string }[];
  supertypes?: readonly string[];
  cases?: readonly string[];
  references?: readonly string[];
  published?: true;
};

export type ModuleFact = { file: string; role: string; entry?: true };

export type DesignFacts = {
  modules: ModuleFact[];
  types: TypeFact[];
  callables: CallableFact[];
};

export type CallableFact = {
  id: string;
  file: string;
  name: string;
  line: number;
  kind: Site['kind'];
  owner?: string;
  exported: boolean;
  entry?: true;
  published?: true;
  params?: readonly unknown[];
  returns?: string;
  forward?: unknown;
  calls?: readonly { cleanup?: true }[];
  references?: unknown;
  paramUses?: unknown;
  ownFields?: unknown;
  returnsField?: unknown;
  decisions?: unknown;
  reads?: unknown;
};
