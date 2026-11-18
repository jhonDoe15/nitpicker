import type { Node } from 'web-tree-sitter';

export type ShapeFields = {
  readonly kind: string;
  readonly value?: string | undefined;
  readonly binding?: string;
  readonly literal?: string;
  readonly text?: string;
  readonly unstable?: true;
};

export type ShapeNode = ShapeFields & {
  readonly children: readonly ShapeNode[];
  readonly start?: number;
  readonly end?: number;
};

export type PlacedNode = ShapeNode & { readonly start: number; readonly end: number };

export type Converted = ShapeNode | readonly ShapeNode[];

export type FileScope = {
  readonly imported: ReadonlyMap<string, string>;
  readonly packageName: string;
  readonly stars: readonly string[];
  readonly classes: readonly string[];
};

export type ClassScope = {
  readonly fields: ReadonlyMap<string, string>;
  readonly methods: ReadonlyMap<string, string>;
  readonly unstable: ReadonlySet<string>;
};

export type Unstable = { readonly unstable?: true };

export type Names = {
  readonly bound: ReadonlySet<string>;
  readonly scope: ClassScope;
  readonly file: FileScope;
};

export type BaseContext = {
  readonly raw: (source: Node | undefined) => Converted;
  readonly get: (source: Node | undefined) => ShapeNode;
  readonly name: (text: string, source: Node) => ShapeNode;
  readonly method: (text: string, source: Node) => ShapeNode;
  readonly unstable: (text: string) => Unstable;
};

export type Context<Extra extends object = object> = BaseContext & Extra;

export type Converter<Extra extends object = object> = (
  source: Node,
  context: Context<Extra>,
) => Converted;

export type UnitEntry = {
  readonly qualifier: string;
  readonly prefix: string;
  readonly scope: ClassScope;
};

export type UnitRoot = UnitEntry & { readonly node: Node };

export type Language<Extra extends object = object> = {
  readonly converters: Readonly<Record<string, Converter<Extra>>>;
  readonly context: Extra;
  readonly isStatementNode: (node: Node) => boolean;
  readonly fileScope: (program: Node) => FileScope;
  readonly outerScope: (program: Node, scope: FileScope) => ClassScope;
  readonly boundNames: (root: Node) => ReadonlySet<string>;
  readonly isUnit: (source: Node) => boolean;
  readonly isFinal: (source: Node) => boolean;
  readonly unitLabel: (source: Node, qualifier: string) => string;
  readonly scopeOf: (source: Node, entry: UnitEntry) => UnitEntry;
  readonly functionOf: (source: Node, context: Context<Extra>) => PlacedNode;
};

export type Unit = {
  readonly id: string;
  readonly file: string;
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly tokens: number;
  readonly final: boolean;
  readonly tree: PlacedNode;
  readonly imports: UnitImports;
};

type UnitImports = {
  readonly names: readonly string[];
  readonly stars: readonly string[];
  readonly classes: readonly string[];
};

export type KotlinExtra = {
  readonly isStatement: (node: Node) => boolean;
  readonly isStatementType: (node: Node) => boolean;
};

export type KotlinContext = Context<KotlinExtra>;

export type KotlinConverter = Converter<KotlinExtra>;
