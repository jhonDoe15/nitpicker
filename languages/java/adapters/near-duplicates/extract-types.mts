import type { Node, Parser } from 'web-tree-sitter';
import type { Unit } from './jvm-types.mts';

export type ParseText = (text: string) => ReturnType<Parser['parse']>;

export type Attempt<Value extends object> =
  | (Value & { readonly declined?: undefined })
  | ({ readonly declined: string } & { readonly [Key in keyof Value]?: undefined });

export type Edit = { readonly start: number; readonly end: number; readonly text: string };
export type ReplaceEdit = Edit & { readonly type: 'replace'; readonly path: string };
export type WriteEdit = {
  readonly type: 'write';
  readonly path: string;
  readonly text: string;
};
export type PathEdit = ReplaceEdit | WriteEdit;

type Reported = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly line: number;
};
type Fix = {
  readonly finding: Reported;
  readonly edits: readonly PathEdit[];
  readonly alsoFixes?: readonly Reported[];
};
export type Outcome = { readonly fix?: Fix; readonly note?: string };
export type Collected = { readonly fixes: Fix[]; readonly notes: string[] };

export type Span = { readonly start: number; readonly end: number };
export type CandidateUnit = Pick<Unit, 'file' | 'name' | 'start' | 'end'>;
export type Candidate = {
  readonly first: CandidateUnit;
  readonly second: CandidateUnit;
  readonly reported: Reported;
  readonly finding: { readonly parameters: readonly unknown[] };
  readonly runs?: readonly Span[];
};
export type Matches = readonly unknown[];
export type Candidates = { readonly candidates: Candidate[]; readonly notes: string[] };

export type SourceFile = { readonly rootNode: Node; readonly file: string; readonly text: string };

type TypeSource = { readonly rootNode: Node; readonly release: () => void };
export type TypeSources = { readonly open: (qualified: string) => TypeSource | undefined };

export type Occurrence = { readonly a: Node; readonly b: Node };

export type ValueHole = {
  readonly key: string;
  readonly pairKey: string;
  readonly type: string;
  readonly kind: 'direct' | 'deferred';
  readonly typeNode?: Node | undefined;
  readonly stem?: string | undefined;
  readonly occurrences: Occurrence[];
};
export type NamedValueHole = ValueHole & { readonly name: string };

type TypeUsage = 'type' | 'exception' | 'mixed' | 'bounded';
export type TypeHole = {
  readonly key: string;
  readonly kind: 'type';
  readonly occurrences: Occurrence[];
};
export type UsedTypeHole = TypeHole & {
  readonly kinds: readonly string[];
  readonly usage: TypeUsage;
};
export type NamedTypeHole = UsedTypeHole & { readonly name: string };
export type AlignHole = ValueHole | TypeHole;

export type FieldInfo = { readonly type: string | undefined; readonly isFinal: boolean };
type FieldInfos = ReadonlyMap<string, FieldInfo>;

export type BindingState = {
  readonly forward: Map<string, string>;
  readonly backward: Map<string, string>;
};
export type AlignState = BindingState & {
  readonly holes: Map<string, AlignHole>;
  readonly typeSites: Set<string>;
  readonly pending: (readonly [Node, Node])[];
};
export type AlignContext = {
  readonly locals: readonly ReadonlySet<string>[];
  readonly written: readonly ReadonlySet<string>[];
  readonly wide: boolean;
  readonly fields?: readonly FieldInfos[] | undefined;
};
export type Aligned = {
  readonly holes: AlignHole[];
  readonly bindings: [string, string][];
  readonly typeSites: number;
};

export type NameSets = {
  readonly staticFields: Set<string>;
  readonly instanceFields: Set<string>;
  readonly methods: Set<string>;
  readonly instanceMethods: Set<string>;
  readonly locals: ReadonlySet<string>;
  readonly inner: Set<string>;
  readonly inherits: boolean;
};
export type InstanceState = 'instance' | 'ambiguous' | 'none';
export type HelperStyle = 'static' | 'instance';

export type FullContext = AlignContext & { readonly units: readonly Node[] };
export type Pair = readonly [Node, Node];
export type Direct = {
  readonly kind: 'literal' | 'parameter' | 'deferred';
  readonly type: string;
  readonly typeNode?: Node | undefined;
};

export type OccurrenceHole = { readonly occurrences: readonly Occurrence[] };
export type Taint = 'direct' | 'container';

export type ArgEnv = {
  readonly declared: ReadonlyMap<string, string | undefined>;
  readonly imports: ReadonlyMap<string, string>;
};

export type FactoryGroup = {
  readonly hole: NamedTypeHole;
  readonly types: readonly string[];
  readonly occurrences: Occurrence[];
};

export type CatchSite = {
  readonly clause: Node;
  readonly tryNode: Node;
  readonly formal: Node;
  readonly name: string;
  readonly handler: Node;
  readonly body: Node;
};
export type CatchNames = {
  readonly type: string;
  readonly caught: string;
  readonly failure: string;
  readonly precise: boolean;
};

export type Renderer = (render: (child: Node) => string) => string;
export type Extra = {
  readonly declaration: string;
  readonly argument: (side: number) => string;
};
export type Shape = {
  readonly rules: ReadonlyMap<number, Renderer>;
  readonly typeParams: readonly string[];
  readonly lead: readonly Extra[];
  readonly tail: readonly Extra[];
  readonly throws: readonly string[];
  readonly interfaces: readonly { readonly name: string; readonly text: string }[];
  readonly bounds?: ReadonlyMap<string, string> | undefined;
};
export type ShapeRequest = {
  readonly typeSources?: TypeSources | undefined;
  readonly methods: readonly Node[];
  readonly typeHoles: readonly NamedTypeHole[];
  readonly taken: ReadonlySet<string>;
  readonly text: string;
  readonly base: string;
  readonly unit: string;
  readonly visibility: string;
};
export type Factory = FactoryGroup & {
  readonly name: string;
  readonly parameter: string;
  readonly exception: string;
  readonly untied: boolean;
  readonly visibility: string;
};
export type Site = CatchSite & {
  readonly hole: NamedTypeHole;
  readonly occurrence: Occurrence;
};
export type NamedSite = Site & { readonly failure: string; readonly caught: string };

export type RenderHole = NamedValueHole | NamedTypeHole;
export type HelperParts = {
  readonly holes: readonly NamedValueHole[];
  readonly typeHoles: readonly NamedTypeHole[];
  readonly shape?: Shape;
};
export type HelperRequest = HelperParts & {
  readonly method: Node;
  readonly name: string;
  readonly isStatic: boolean;
  readonly outdent?: number;
  readonly visibility?: string;
  readonly indent?: string;
};

export type PairRequest = {
  readonly methods: Pair;
  readonly label: string;
  readonly engineHoles: number;
  readonly claimed: Set<string>;
  readonly typeSources?: TypeSources | undefined;
  readonly text: string;
  readonly roots: readonly Node[];
  readonly cross?: { readonly fields: readonly FieldInfos[] };
  readonly methodsCheck?: (methods: readonly Node[]) => string | undefined;
};
export type Plan = {
  readonly name: string;
  readonly holes: NamedValueHole[];
  readonly typeHoles: NamedTypeHole[];
  readonly taken: Set<string>;
};
export type ShapedPlan = Plan & { readonly shape: Shape };

export type ScanEntry = { readonly name: string; readonly text: string };
export type Scan = ((folders: readonly string[]) => ScanEntry[]) & {
  everySet: (folder: string, packageLine: string) => string[];
};
export type NameFound = {
  readonly name: string;
  readonly folder: string;
  readonly folders: readonly string[];
};
export type ImportedName = {
  readonly isStatic: boolean;
  readonly wildcard: boolean;
  readonly name: string;
  readonly last: string;
};
export type CrossRequest = {
  readonly methods: Pair;
  readonly sources: readonly [SourceFile, SourceFile];
  readonly label: string;
  readonly engineHoles: number;
  readonly claimed: Set<string>;
  readonly typeSources: TypeSources;
  readonly names: { readonly className: string };
};
export type Extracted = {
  readonly edits: ReplaceEdit[];
  readonly member: string;
  readonly interfaces: Shape['interfaces'];
};
export type CrossPending = {
  readonly candidate: Candidate;
  readonly methods: Pair;
  readonly sources: readonly [SourceFile, SourceFile];
};
export type CrossGroup = {
  readonly sources: readonly [SourceFile, SourceFile];
  readonly candidates: Candidate[];
  readonly pairs: Pair[];
  readonly methods: Pair;
};
export type CrossContext = { readonly scan: Scan; readonly typeSources: TypeSources };
export type OwnedEdit = ReplaceEdit & { readonly owner: number };
export type ClassBodyRequest = {
  readonly name: string;
  readonly members: readonly string[];
  readonly unit: string;
  readonly annotations: readonly string[];
};
export type ClassTextRequest = ClassBodyRequest & {
  readonly header: string;
  readonly packageLine: string;
  readonly imports: readonly string[];
};
export type QualifiedUse = {
  readonly start: number;
  readonly end: number;
  readonly prefix: string;
  readonly text: string;
};
