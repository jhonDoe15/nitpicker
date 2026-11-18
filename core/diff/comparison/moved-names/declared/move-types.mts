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
