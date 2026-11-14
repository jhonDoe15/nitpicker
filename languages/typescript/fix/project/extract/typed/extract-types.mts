import type TypeScript from 'typescript';
import type { FixContext, Planned, Project, ReplaceEdit } from '../../typed/project-types.mts';

export type Side = 0 | 1;

export type Both<T> = readonly [T, T];

export type UnitNode = TypeScript.FunctionLikeDeclaration;

export type Region = { readonly pos: number; readonly end: number };

export type RunRegion = Region & { readonly start: number };

export type SymbolSet = Set<TypeScript.Symbol | undefined>;

type Occurrence = { readonly a: TypeScript.Node; readonly b: TypeScript.Node };

export type Hole = {
  readonly key: string;
  readonly kind: 'literal' | 'parameter' | 'thunk';
  readonly occurrences: [Occurrence, ...Occurrence[]];
};

export type NamedHole = Hole & { readonly name: string };

export type InputPair = {
  readonly symbol: TypeScript.Symbol | undefined;
  readonly nodes: Both<TypeScript.Identifier>;
};

export type ExtractEnv = {
  readonly project: Project;
  readonly context: FixContext;
  readonly sourceFile: TypeScript.SourceFile;
  readonly path: string;
  readonly checker: TypeScript.TypeChecker;
  readonly claimed: ReadonlySet<string>;
  readonly claim: (name: string) => void;
};

export type SharedEnv = ExtractEnv & {
  readonly units: Both<UnitNode>;
  readonly regions: Both<Region>;
  readonly written: Both<SymbolSet>;
  readonly regionWrites: Both<SymbolSet>;
};

export type AlignEnv = SharedEnv & {
  readonly forward: Map<TypeScript.Symbol | undefined, TypeScript.Symbol | undefined>;
  readonly backward: Map<TypeScript.Symbol | undefined, TypeScript.Symbol | undefined>;
  readonly holes: Map<string, Hole>;
  readonly inputs: Map<TypeScript.Symbol | undefined, InputPair>;
  readonly pending: Both<TypeScript.Node>[];
};

export type HoleEnv = Pick<
  AlignEnv,
  'checker' | 'sourceFile' | 'units' | 'regions' | 'written' | 'regionWrites'
> & { readonly holes: Map<string, Hole> };

export type TemplateEnv = {
  readonly checker: TypeScript.TypeChecker;
  readonly unit: TypeScript.Node;
  readonly holeNodes: readonly TypeScript.Node[];
};

export type Aligned =
  | { readonly declined: string; readonly holes?: undefined; readonly inputs?: undefined }
  | {
      readonly declined?: undefined;
      readonly holes: Hole[];
      readonly inputs: InputPair[];
    };

export function eachSide<T, R>(pair: Both<T>, visit: (item: T, side: Side) => R): Both<R> {
  return [visit(pair[0], 0), visit(pair[1], 1)];
}

export type LineSpan = { readonly start: number; readonly end: number };

export type Candidate = {
  readonly reported: {
    readonly tool: string;
    readonly rule: string;
    readonly path: string;
    readonly line: number;
  };
  readonly first: { readonly name: string };
  readonly second: { readonly name: string };
  readonly finding: { readonly parameters: readonly unknown[] };
};

export type PartialCandidate = Candidate & { readonly runs: Both<LineSpan> };

export type Found = {
  readonly matches: unknown;
  readonly units: readonly { readonly name: string }[];
  readonly nodes: readonly UnitNode[];
};

export type Candidates<C> = { readonly candidates: C[]; readonly notes: string[] };

export type Strategy<C extends Candidate, Input> = {
  readonly candidatesOf: (matches: unknown) => Candidates<C>;
  readonly inputOf: (candidate: C, found: Found) => Input;
  readonly extract: (input: Input, env: ExtractEnv) => Planned<ReplaceEdit>;
};

export type WholeInput = {
  readonly units: Both<UnitNode>;
  readonly label: string;
  readonly engineHoles: number;
};

export type PartialInput = {
  readonly units: Both<UnitNode>;
  readonly runs: Both<LineSpan>;
  readonly label: string;
  readonly engineHoles: number;
};

export function paired<T>(left: readonly T[], right: readonly T[]): Both<T>[] {
  return left.flatMap((item, index) => {
    const other = right[index];
    return other === undefined ? [] : [[item, other] as const];
  });
}

export function bodyOf(unit: UnitNode): TypeScript.Node {
  return unit.body ?? unit;
}

export type Run = readonly [TypeScript.Statement, ...TypeScript.Statement[]];

export type RunSide = {
  readonly unit: UnitNode;
  readonly statements: Run;
  readonly region: RunRegion;
  readonly checker: TypeScript.TypeChecker;
  readonly written: SymbolSet;
  readonly regionWrites: SymbolSet;
};

export type RunOutput =
  | {
      readonly kind: 'value';
      readonly where: string;
      readonly name: string;
      readonly keyword: 'const' | 'let';
      readonly typeText: string | undefined;
    }
  | { readonly kind: 'return' | 'none'; readonly where?: undefined };

export function extractEnv(base: Omit<ExtractEnv, 'claimed' | 'claim'>): ExtractEnv {
  const claimed = new Set<string>();
  return {
    ...base,
    claimed,
    claim(name) {
      claimed.add(name);
    },
  };
}
