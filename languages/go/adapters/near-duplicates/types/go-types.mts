import type { Node } from 'web-tree-sitter';
import type {
  Converted,
  PlacedNode,
  ShapeNode,
} from '../../../../java/adapters/near-duplicates/jvm-types.mts';

export type GoContext = {
  readonly raw: (source: Node | undefined) => Converted;
  readonly get: (source: Node | undefined) => ShapeNode;
  readonly name: (source: Node) => GoNameNode;
  readonly isFresh: (source: Node) => boolean;
};

export type GoConverter = (source: Node, context: GoContext) => Converted;

export type GoConverters = Readonly<Record<string, GoConverter>>;

export type GoNameNode = PlacedNode & { readonly addressTaken?: true };

export type FileNames = {
  readonly directory: string;
  readonly packageNames: ReadonlySet<string>;
  readonly imports: ReadonlyMap<string, string>;
};

export type UnitParts = {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly tokens: number;
  readonly final: boolean;
  readonly tree: PlacedNode;
};

export type GoUnit = UnitParts & { readonly id: string; readonly file: string };

export type GoSource = { readonly file: string; readonly text: string };
