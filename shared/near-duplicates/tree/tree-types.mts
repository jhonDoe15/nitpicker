import type { ModelName, NamedTest } from '../../logic/typed/term-types.mts';

export type TreeNode = {
  readonly kind: string;
  readonly children: readonly TreeNode[];
  readonly value?: string | undefined;
  readonly text?: string;
  readonly binding?: string;
  readonly literal?: string;
  readonly start?: number;
  readonly end?: number;
  readonly commutes?: true | undefined;
  readonly unstable?: true;
  readonly addressTaken?: true;
  readonly bits?: number;
  readonly signed?: true;
  readonly model?: ModelName;
  readonly helper?: NamedTest;
  readonly operation?: string;
};

export type TreeFields = Omit<TreeNode, 'kind' | 'children'>;

export type BoundName = {
  readonly kind: 'name';
  readonly binding: 'bound';
  readonly value: string;
};

export type NearUnit = {
  readonly id: string;
  readonly file: string;
  readonly name: string;
  readonly final: boolean;
  readonly tree: TreeNode;
};

export type KeyMode = {
  readonly bound: 'number' | 'erase' | 'id';
  readonly values: boolean;
  readonly parameters?: ReadonlyMap<string, number> | undefined;
};

export type KeyCache = (node: TreeNode, mode: KeyMode) => string;

export type Template = Omit<TreeNode, 'children'> & { readonly children: TreeNode[] };

export type Side = 'a' | 'b';

export type HoleKind = 'value' | 'type';

export type Hole = {
  readonly kind: HoleKind;
  readonly index: number;
  readonly a: TreeNode;
  readonly b: TreeNode;
  uses: number;
  deferred: boolean;
};

type Gap = {
  readonly kind: 'gap';
  readonly side: Side;
  readonly node: TreeNode;
  readonly size: number;
};

type Rename = { readonly kind: 'rename'; readonly a: TreeNode; readonly b: TreeNode };

export type AlignState = {
  readonly cachedKey: KeyCache;
  readonly forward: Map<string | undefined, string | undefined>;
  readonly backward: Map<string | undefined, string | undefined>;
  readonly numbers: Map<string | undefined, number>;
  readonly renames: Rename[];
  readonly holes: Hole[];
  readonly holeKeys: Map<string, Hole>;
  readonly gaps: Gap[];
  conflicts: number;
  shared: number;
};

export type PreparedUnit = {
  readonly unit: NearUnit;
  readonly tree: TreeNode;
  readonly rewritten: boolean;
  readonly plainKey: string;
  readonly size: number;
  readonly tokens: readonly number[];
  readonly bag: ReadonlyMap<number, number>;
  readonly masks: TokenMasks;
};

export type TokenMasks = {
  readonly masks: ReadonlyMap<number, Uint32Array>;
  readonly length: number;
  readonly words: number;
};
