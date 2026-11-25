export type Reported = { readonly path: string; readonly line: number };

export type Outcome<Fix> = {
  readonly fix?: Fix | undefined;
  readonly note?: string | undefined;
};

export type Collected<Fix> = { readonly fixes: Fix[]; readonly notes: string[] };

export type BindingState<Left, Right> = {
  readonly forward: Map<Left, Right>;
  readonly backward: Map<Right, Left>;
};

export type HoleState<Node> = Map<string, TypeHole<Node>>;

export type SiteState = Set<string>;

export type TypeHole<Node> = {
  readonly key: string;
  readonly kind: string;
  readonly occurrences: { readonly a: Node; readonly b: Node }[];
};

export type TypePair<Node> = readonly [Node, Node];

export type TypePairWalk<Node> = {
  readonly textOf: (node: Node) => string;
  readonly expand: (pair: TypePair<Node>, pending: TypePair<Node>[]) => string | undefined;
};

export type MatchUnit = {
  readonly file: string;
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly side: string;
};

type MatchFinding = {
  readonly verdict: string;
  readonly proof?: unknown;
  readonly parameters?: readonly unknown[];
  readonly rewritten?: unknown;
  readonly run?: Readonly<Record<string, unknown>>;
};

export type Match = {
  readonly pair: readonly [MatchUnit, MatchUnit];
  readonly finding: MatchFinding;
};

export type ExtractOptions = { readonly crossFile: boolean; readonly textProof: boolean };

export type Candidate = Match & {
  readonly reported: {
    readonly tool: string;
    readonly rule: string;
    readonly path: string;
    readonly line: number;
  };
  readonly first: MatchUnit;
  readonly second: MatchUnit;
};

export type PartialCandidate = Candidate & { readonly runs: unknown[] };

export type Candidates<Found> = { readonly candidates: Found[]; readonly notes: string[] };

export type CandidateOutcome = { readonly candidate?: Candidate; readonly note?: string };

export type Replacement = { readonly start: number; readonly end: number; readonly text: string };
