export type ReportedDirection = {
  readonly source: string;
  readonly target: string;
  readonly delta: number;
  readonly cause: unknown;
  readonly path?: unknown;
  readonly message?: string;
};

type ReportedModule<File extends string | undefined = string> = {
  readonly file: File;
  readonly fanIn: number;
  readonly fanOut: number;
  readonly totalCoupling: number;
  readonly instability: number | undefined;
};

export type ReportedPackage = {
  readonly name: string;
  readonly modules: number;
  readonly fanIn: number;
  readonly fanOut: number;
  readonly instability: number | undefined;
  readonly cohesion: {
    readonly internalEdges: number;
    readonly edgeDensity: number | undefined;
    readonly connectedComponents: number;
    readonly largestComponentShare: number | undefined;
  };
};

export type CouplingReport<File extends string | undefined = string> = {
  readonly summary: {
    readonly modules: number;
    readonly dependencies: number;
    readonly packages: number;
  };
  readonly modules: ReportedModule<File>[];
  readonly packages: ReportedPackage[];
  readonly stabilityDirection: ReportedDirection[];
};
