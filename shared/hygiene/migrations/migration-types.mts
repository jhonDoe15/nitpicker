export type Migration = {
  readonly path: string;
  readonly set: string;
  readonly name: string;
  readonly label: string;
  readonly version: readonly bigint[];
};

export type GraphCandidate =
  | { readonly kind: 'alembic'; readonly set: string }
  | { readonly kind: 'django'; readonly set: string; readonly app: string };

export type RevisionNode = {
  readonly path: string;
  readonly id: string;
  readonly parents: readonly string[];
  readonly starts: boolean;
};

export type DjangoDependency = { readonly app: string; readonly name: string };

export type DjangoNode = {
  readonly path: string;
  readonly id: string;
  readonly dependencies: readonly DjangoDependency[];
  readonly starts: boolean;
};

export type RevisionGraphs = Map<string, Map<string, RevisionNode>>;
