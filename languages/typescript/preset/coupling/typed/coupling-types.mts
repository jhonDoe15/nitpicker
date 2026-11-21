export type Matcher = { test(value: string): boolean };

export type CouplingLayout = {
  isSourceFile(file: string): boolean;
  isSourceUnderRoot(file: string, root: string): boolean;
};

export type ModuleMetric = {
  readonly module: string;
  readonly package: string;
  readonly fanIn: number;
  readonly fanOut: number;
  readonly totalCoupling: number;
  readonly instability: unknown;
  readonly runtimeFanIn?: number;
  readonly runtimeFanOut?: number;
  readonly runtimeInstability?: unknown;
};

export type PackageMetric = {
  readonly name: string;
  readonly modules: number;
  readonly fanIn: number;
  readonly fanOut: number;
  readonly instability: unknown;
  readonly cohesion: {
    readonly internalEdges: number;
    readonly edgeDensity: unknown;
    readonly connectedComponents: number;
    readonly largestComponentShare: unknown;
  };
};

export type SharedImport = {
  readonly from: string;
  readonly to: string;
  readonly role: 'production' | 'test';
};
