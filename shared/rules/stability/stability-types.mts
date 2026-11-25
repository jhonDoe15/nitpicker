import type { RoleLike } from '../features/typed/role-types.mts';

export type StabilityEdge = {
  readonly source: string;
  readonly target: string;
  readonly kind?: string | undefined;
};

export type StabilityGraph = {
  readonly modules: readonly string[];
  readonly edges: readonly StabilityEdge[];
  readonly packageOf: (module: string) => string;
  readonly groupOf?: ((module: string) => string) | undefined;
  readonly roleOf?: ((module: string) => RoleLike) | undefined;
  readonly groupNoun?: string | undefined;
  readonly fileOf?: ((module: string) => string | undefined) | undefined;
};

export type Level = 'package' | 'unit';

export type CauseUnit = {
  readonly unit: string;
  readonly folders: readonly string[];
  readonly files: readonly string[];
  readonly count: number;
};

export type Cause = { readonly folders: readonly string[]; readonly units: readonly CauseUnit[] };

export type CauseContext = {
  readonly modules: readonly string[];
  readonly group: (module: string) => string;
  readonly unitOf: (module: string) => string;
  readonly labelOf: (level: Level, module: string) => string;
  readonly fileOf: (module: string) => string;
};

export type GraphContext = CauseContext & {
  readonly role: (module: string) => RoleLike;
  readonly facePackages: ReadonlyMap<string | undefined, ReadonlySet<string>>;
};

export type StabilityDirection = {
  readonly source: string;
  readonly target: string;
  readonly sourceInstability: number;
  readonly targetInstability: number;
  readonly delta: number;
  readonly cause: Cause;
  readonly path?: string;
  readonly message?: string;
};

export type CauseFinding = {
  readonly message: string;
  readonly cause?: Cause | undefined;
};
