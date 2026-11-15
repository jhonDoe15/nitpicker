import {
  kotlinModules as untypedKotlinModules,
  readKotlinCrapFindings as untypedReadKotlinCrapFindings,
  readKotlinMetrics as untypedReadKotlinMetrics,
  readKotlinStructureFindings as untypedReadKotlinStructureFindings,
} from '../kotlin-metrics.mjs';

export type MetricsFunction = {
  readonly file: string;
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly [field: string]: unknown;
};

type MetricsFile = {
  readonly file: string;
  readonly package?: string;
  readonly classes: readonly string[];
  readonly [field: string]: unknown;
};

export type Metrics = {
  readonly functions: readonly MetricsFunction[];
  readonly files: readonly MetricsFile[];
};

export type KotlinFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly symbol: string;
  readonly path: string;
  readonly message: string;
  readonly classification: string;
  readonly identity: string;
  readonly allowedForm: string;
  readonly location: { readonly line: number; readonly endLine?: number };
  readonly ratchet: { readonly key: string; readonly value: number };
  readonly [field: string]: unknown;
};

type CrapOptions = {
  readonly projectRoot: string;
  readonly jacoco: string;
  readonly crapLimit?: number;
};

export const readKotlinMetrics: (reportRoot: string) => Metrics = untypedReadKotlinMetrics;

export const readKotlinStructureFindings: (
  metrics: Metrics,
  projectRoot: string,
) => KotlinFinding[] = untypedReadKotlinStructureFindings;

export const kotlinModules: (metrics: Metrics) => {
  moduleOf: Map<string, string>;
  fileOf: Map<string, string>;
} = untypedKotlinModules;

const crapFindings: (
  metrics: Metrics,
  options: {
    readonly projectRoot: string;
    readonly jacoco: string;
    readonly crapLimit: number | undefined;
  },
) => KotlinFinding[] = untypedReadKotlinCrapFindings;

export function readKotlinCrapFindings(metrics: Metrics, options: CrapOptions): KotlinFinding[] {
  return crapFindings(metrics, { crapLimit: undefined, ...options });
}
