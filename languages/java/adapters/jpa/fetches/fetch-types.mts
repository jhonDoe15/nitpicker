export type Relation = { readonly many: boolean; readonly target: string };

export type RelationOf = (entity: string, field: string) => Relation | undefined;

export type FetchOwner = { readonly entity: string; readonly key: string };

export type Joined = Map<string, boolean>;

export type JpqlRoot = { readonly alias: string | undefined; readonly entity: string };

export type JpqlJoin = {
  readonly owner: string;
  readonly path: string[];
  readonly alias: string | undefined;
  readonly fetched: boolean;
};

export type JpqlFetches = { readonly roots: JpqlRoot[]; readonly joins: JpqlJoin[] };

export type GraphNode = {
  readonly name: string | undefined;
  readonly subgraph: string | undefined;
};

export type FetchSource = {
  readonly source: string;
  readonly blanked: string;
  readonly depths: Int32Array;
  readonly starts: number[];
};

export type FetchSite = { readonly kind: string; readonly at: number };

export type Declaration = {
  readonly name: string;
  readonly entityName: string | undefined;
  readonly superclass: string | undefined;
  readonly text: string;
  readonly depths: Int32Array;
  readonly parens: Int32Array;
  readonly open: number;
  readonly close: number;
};

export type Steps = Readonly<Record<string, number | undefined>>;
