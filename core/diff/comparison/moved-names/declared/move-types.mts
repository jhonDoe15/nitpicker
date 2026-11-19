export type Moves = Map<string, string>;

export type DeclaredMoves = {
  readonly names: Moves;
  readonly bare: Map<string, readonly [string, string]>;
  readonly filePackages: Map<string, Moves>;
  readonly covered: Set<string>;
  readonly folders: Moves;
  readonly packageDirs: Set<string>;
};

export type MoveFields = {
  readonly baseToHeadRenames?: Moves | undefined;
  readonly baseToHeadDirectories?: Moves | undefined;
  readonly baseToHeadPackages?: Moves | undefined;
  readonly baseToHeadDeclared?: DeclaredMoves | undefined;
};

export type BaseMoves = {
  readonly files: Moves;
  readonly longestFirst: [string, string][];
  readonly directories: Moves;
  readonly names: Moves;
  readonly bare: Map<string, readonly [string, string]>;
  readonly bareNames: Moves;
  readonly declared: DeclaredMoves;
  readonly headPlaces: Set<string>;
  readonly stems: Moves;
  readonly packageNames: Moves;
};

export type DeclaredFiles = {
  readonly base: ReadonlyMap<string, string>;
  readonly head: ReadonlyMap<string, string>;
};
