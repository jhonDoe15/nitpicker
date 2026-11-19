export type BracketPair = { readonly open: string; readonly close: string | undefined };

export type TextPart = { start: number; text: string };

export type PartOptions = { readonly angles?: false };

export type StringLiteral = {
  readonly value: string;
  readonly offset: number;
  readonly continued: boolean;
};

export type TypeKind = 'map' | 'collection' | 'scalar' | 'class';

export type TypeParts = {
  readonly simple: string;
  readonly kind: TypeKind;
  readonly argument: string;
  readonly array: boolean;
  readonly known: boolean;
};

export type JarText = { readonly name: string; readonly text: string };

export type EndRecord = { readonly count: number; readonly size: number; readonly offset: number };

export type CentralEntry = {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly localOffset: number;
  readonly next: number;
};

export type MetadataProperty = {
  readonly name: string;
  readonly type: unknown;
  readonly removed: boolean;
  readonly replacement?: string;
};

export type ClasspathMetadata = {
  readonly properties: MetadataProperty[];
  readonly groups: string[];
};

export type KeyLists = { readonly exact: string[]; readonly open: string[] };

export type ClassKeys = KeyLists & { readonly owned: string[] };

export type KnownIndex = {
  readonly exact: Set<string>;
  readonly open: Set<string>;
  readonly owned: Set<string>;
  readonly claimed: Set<string>;
  readonly removed: Map<string, string | undefined>;
  readonly display: Map<string, string>;
  nodes: Set<string>;
};

export type KnownInput = {
  readonly metadata: ClasspathMetadata;
  readonly classes: ClassKeys;
  readonly references: KeyLists;
};

export type Verdict = {
  readonly removed?: true;
  readonly prefix?: string;
  readonly replacement: string | undefined;
};

export type RankedCandidate = {
  readonly sibling: number;
  readonly segment: number;
  readonly distance: number;
};

export type UnboundSource = {
  readonly file: string;
  readonly text: string;
  readonly code: string;
  readonly kotlin: boolean;
};

export type SourceText = Pick<UnboundSource, 'text' | 'code'>;

export type ClassSource = Pick<UnboundSource, 'code' | 'kotlin'>;

export type PropertyMember = { readonly name: string; readonly type: string | undefined };

export type ClassDeclaration = {
  readonly name: string;
  readonly kind: string;
  readonly offset: number;
  readonly superclass: string | undefined;
  readonly renamed: boolean;
  readonly members: PropertyMember[];
};

export type ConstructorRead = { readonly parameters: string | undefined; readonly end: number };

export type BodyRead = { readonly header: string; readonly body: string };

export type MembersInput = {
  readonly body: string;
  readonly parameters: string | undefined;
  readonly kotlin: boolean;
  readonly name: string;
};

export type MemberStep = {
  readonly key: string;
  readonly type: string | undefined;
  readonly depth: number;
};

export type ClassStep = { readonly prefix: string; readonly name: string; readonly depth: number };

export type PropertyContext = {
  readonly classes: Map<string, ClassDeclaration[]>;
  readonly exact: Set<string>;
  readonly open: Set<string>;
  readonly groups: Set<string>;
};

export type Binding = { readonly prefix: string; readonly target: string | undefined };

export type KeyAt = { readonly key: string; readonly line: number };

export type WrittenKey = KeyAt & { readonly path: string };

export type ArgumentsText = {
  readonly start: number;
  readonly text: string;
  readonly code: string;
};

export type AttributeValue = { readonly start: number; readonly text: string };

export type UnboundOptions = {
  readonly classpath?: readonly string[];
  readonly sourceRoots: readonly string[];
  readonly testSourceRoots: readonly string[];
  readonly resourceRoots: readonly string[];
};

export type KnownIndexInput = {
  readonly projectRoot: string;
  readonly classpath: readonly string[];
  readonly roots: { readonly resources: readonly string[] };
  readonly sources: readonly UnboundSource[];
};

export type ReferencedInput = {
  readonly projectRoot: string;
  readonly sources: readonly UnboundSource[];
  readonly resourceRoots: readonly string[];
};
