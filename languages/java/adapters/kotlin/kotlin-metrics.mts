import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { KOTLIN_REPORTS } from './report-names/kotlin-report-names.mts';
import { ingestCrapFunctions } from '../../ingest/crap.mts';
import { ownRange } from '../../ingest/units/unit-coverage.mts';
import type { CoverageUnit, FunctionUnit } from '../../ingest/units/unit-types.mts';
import { MESSAGES, RULE_IDS } from '../../../../shared/policy.mjs';
import { definedField as untypedDefinedField } from '../../../../shared/messages/messages.mjs';
import { repeatsInSource as untypedRepeatsInSource } from '../../../../shared/rules/finding-helpers.mjs';
import {
  methodText as untypedMethodText,
  structureFindings as untypedStructureFindings,
} from '../../../../shared/ingest/structure-report.mjs';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { existingInside } from './typed/kotlin-tool-views.mts';
import type { JavaFinding } from '../typed/java-values.mts';

export type MetricsFunction = {
  readonly file: string;
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly complexity: number;
  readonly initializer: boolean;
  readonly lambda: boolean;
  readonly inline: boolean;
  readonly [field: string]: unknown;
};
type MetricsFile = {
  readonly file: string;
  readonly package?: string | undefined;
  readonly classes: readonly string[];
  readonly imports?: readonly string[] | undefined;
  readonly [field: string]: unknown;
};
type MetricsType = {
  readonly file: string;
  readonly name: string;
  readonly start: number;
  readonly kind: string;
  readonly methods: number;
  readonly fields: number;
  readonly extends?: string | undefined;
  readonly [field: string]: unknown;
};
export type Metrics = {
  readonly functions: readonly MetricsFunction[];
  readonly files: readonly MetricsFile[];
  readonly types?: readonly MetricsType[] | undefined;
};
export type KotlinFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly symbol: string;
  readonly path: string;
  readonly message: string;
  readonly classification: string;
  readonly identity: string;
  readonly allowedForm?: string | undefined;
  readonly location: { readonly line: number; readonly endLine?: number };
  readonly ratchet?: {
    readonly key: string;
    readonly value: number;
    readonly worseMessage?: string | undefined;
    readonly worseAllowedForm?: string | undefined;
  };
  readonly [field: string]: unknown;
};
type Roots = { projectRoot: string; jacoco: string; crapLimit?: number | undefined };

const definedField: (name: string, value: string | undefined) => Record<string, string> =
  untypedDefinedField;
const repeatsInSource: (name: string) => boolean = untypedRepeatsInSource;
const methodText: (
  sources: Map<string, string[]>,
  projectRoot: string,
  entry: { file: string; start: number; end: number },
) => string = untypedMethodText;
const structureFindings: (
  entries: readonly MetricsFunction[],
  projectRoot: string,
) => KotlinFinding[] = untypedStructureFindings;
const unknownMessage: string = MESSAGES.crapCoverageUnknownPlain;

function isMetrics(value: unknown): value is Metrics {
  return Array.isArray(fieldOf(value, 'functions')) && Array.isArray(fieldOf(value, 'files'));
}

const DEFAULT_ARGUMENTS_SUFFIX = '$default';

export function readKotlinMetrics(reportRoot: string): Metrics {
  const report = path.join(reportRoot, KOTLIN_REPORTS.metrics);
  const parsed: unknown = existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : undefined;
  return isMetrics(parsed) ? parsed : { functions: [], files: [] };
}

const RETURN_EARLY = 'Return early instead of nesting.';
const EXTRACT_NESTED = 'Move the nested part into its own function.';

function extractNested(text: string | undefined): string | undefined {
  return text?.replace(RETURN_EARLY, EXTRACT_NESTED);
}

function withExtractAdvice(finding: KotlinFinding): KotlinFinding {
  const { ratchet } = finding;
  return {
    ...finding,
    message: extractNested(finding.message) ?? finding.message,
    ...definedField('allowedForm', extractNested(finding.allowedForm)),
    ...(ratchet === undefined
      ? {}
      : {
          ratchet: {
            ...ratchet,
            ...definedField('worseMessage', extractNested(ratchet.worseMessage)),
            ...definedField('worseAllowedForm', extractNested(ratchet.worseAllowedForm)),
          },
        }),
  };
}

function adviseInitializers(
  findings: KotlinFinding[],
  functions: readonly MetricsFunction[],
): KotlinFinding[] {
  const initializers = new Set(
    functions.filter(({ initializer }) => initializer).map(({ name }) => name),
  );
  return findings.map((finding) =>
    finding.rule === RULE_IDS.functionControlNesting && initializers.has(finding.symbol)
      ? withExtractAdvice(finding)
      : finding,
  );
}

export function readKotlinStructureFindings(
  metrics: Metrics,
  projectRoot: string,
): KotlinFinding[] {
  return adviseInitializers(structureFindings(metrics.functions, projectRoot), metrics.functions);
}

export function selectKotlinMethods(
  fn: FunctionUnit,
  candidates: readonly CoverageUnit[],
  siblings: readonly FunctionUnit[],
): CoverageUnit[] {
  return withoutStaticBridges(
    ownRange(
      fn,
      candidates.filter((method) => !method.name.endsWith(DEFAULT_ARGUMENTS_SUFFIX)),
      siblings,
    ),
  );
}

function withoutStaticBridges(methods: CoverageUnit[]): CoverageUnit[] {
  const deepest = Map.groupBy(methods, (method) => `${method.name}:${String(method.line)}`);
  return methods.filter((method) => {
    const group = deepest.get(`${method.name}:${String(method.line)}`);
    return !(group ?? []).some(
      (other) =>
        other.className !== method.className && other.className.startsWith(`${method.className}$`),
    );
  });
}

function jacocoKeys(metrics: Metrics): (file: string) => string[] {
  const keys = new Map(
    metrics.files.map(({ file, package: packageName }): [string, string] => [
      file,
      [(packageName ?? '').replaceAll('.', '/'), path.posix.basename(file)]
        .filter(Boolean)
        .join('/'),
    ]),
  );
  return (file) => {
    const key = keys.get(file);
    return key === undefined ? [] : [key];
  };
}

export function readKotlinCrapFindings(
  metrics: Metrics,
  { projectRoot, jacoco, crapLimit }: Roots,
): JavaFinding[] {
  const sources = new Map<string, string[]>();
  const functions = metrics.functions
    .filter((entry) => !entry.inline)
    .map((entry): FunctionUnit => ({
      ccn: entry.complexity,
      file: entry.file,
      name: entry.name,
      longName: entry.name,
      start: entry.start,
      end: entry.end,
      lambda: false,
      lineScoped: entry.initializer,
      lineFallback: entry.lambda,
      numberedAmongSameSource: repeatsInSource(entry.name),
    }));
  return ingestCrapFunctions(functions, jacoco, {
    jacocoKeys: jacocoKeys(metrics),
    limit: crapLimit,
    unknownMessage,
    selectMethods: selectKotlinMethods,
    sourceText: (entry) =>
      existingInside(projectRoot, [entry.file]).length > 0
        ? methodText(sources, projectRoot, entry)
        : undefined,
  }).findings;
}

export function kotlinModules(metrics: Metrics): {
  moduleOf: Map<string, string>;
  fileOf: Map<string, string>;
} {
  const moduleOf = new Map<string, string>();
  const fileOf = new Map<string, string>();
  for (const { file, classes } of metrics.files) {
    if (classes.length === 0) {
      continue;
    }
    const representative = classes.reduce((best, name) => (name < best ? name : best));
    for (const name of classes) {
      moduleOf.set(name, representative);
    }
    fileOf.set(representative, file);
  }
  return { moduleOf, fileOf };
}
