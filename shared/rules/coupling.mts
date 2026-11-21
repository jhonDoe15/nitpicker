import { RULE_IDS } from '../policy.mts';
import { metricFindings, summaryMetrics } from './finding-parts.mts';
import type { Finding } from '../values/findings.mts';
import { fieldOf, fieldsOf, listOf, textOf } from '../values/readers.mts';
import type { CouplingReport, ReportedPackage } from './typed/coupling-report-types.mts';
import { reportedDirection } from './coupling/reported-direction.mts';
import { connectedComponentSizes } from './coupling/components.mts';
import { rounded, stabilityDirections } from './stability/stability-direction.mts';

type StabilityInput = Parameters<typeof stabilityDirections>[0];
type Edge = {
  readonly source: string;
  readonly target: string;
  readonly kind?: string | undefined;
};
type EdgeSide = 'source' | 'target';

const SOURCE: EdgeSide = 'source';
const TARGET: EdgeSide = 'target';
type CouplingInput = StabilityInput & { readonly runtime?: true };

type ModuleMetric = {
  readonly module: string;
  readonly package: string;
  readonly fanIn: number;
  readonly fanOut: number;
  readonly totalCoupling: number;
  readonly instability: number | undefined;
  readonly runtimeFanIn?: number;
  readonly runtimeFanOut?: number;
  readonly runtimeInstability?: number | undefined;
};

type PackageMetric = ReportedPackage;

type CouplingMetrics = {
  readonly modules: ModuleMetric[];
  readonly packages: PackageMetric[];
  readonly stabilityDirection: ReturnType<typeof stabilityDirections>;
};
type ReportInput<File extends string | undefined> = Omit<StabilityInput, 'edges' | 'fileOf'> & {
  readonly edges: readonly Edge[];
  readonly fileOf: (module: string) => File;
};

const MODULE_METRICS = [
  'fanIn',
  'fanOut',
  'totalCoupling',
  'instability',
  'runtimeFanIn',
  'runtimeFanOut',
  'runtimeInstability',
];

function moduleMetricFindings(analyzerName: string, module: unknown): Finding[] {
  const file = textOf(fieldOf(module, 'file'));
  return MODULE_METRICS.flatMap((metricName) =>
    metricFindings({
      analyzerName,
      rule: 'module-coupling',
      path: file,
      identity: `module:${metricName}`,
      message: `${metricName} for ${file}`,
      metricName,
      value: fieldOf(module, metricName),
    }),
  );
}

function packageMetricFindings(analyzerName: string, packageMetric: unknown): Finding[] {
  const cohesion = fieldOf(packageMetric, 'cohesion');
  const name = textOf(fieldOf(packageMetric, 'name'));
  const values = {
    modules: fieldOf(packageMetric, 'modules'),
    fanIn: fieldOf(packageMetric, 'fanIn'),
    fanOut: fieldOf(packageMetric, 'fanOut'),
    instability: fieldOf(packageMetric, 'instability'),
    internalEdges: fieldOf(cohesion, 'internalEdges'),
    edgeDensity: fieldOf(cohesion, 'edgeDensity'),
    connectedComponents: fieldOf(cohesion, 'connectedComponents'),
    largestComponentShare: fieldOf(cohesion, 'largestComponentShare'),
  };
  return Object.entries(values).flatMap(([metricName, value]) =>
    metricFindings({
      analyzerName,
      rule: 'package-coupling',
      path: '.',
      identity: `package:${name}:${metricName}`,
      message: `${metricName} for package ${name}`,
      metricName,
      value,
    }),
  );
}

export function evaluateCoupling(report: unknown, analyzerName: string): Finding[] {
  return [
    ...summaryMetrics(analyzerName, fieldsOf(fieldOf(report, 'summary')), 'coupling'),
    ...listOf(fieldOf(report, 'modules')).flatMap((module) =>
      moduleMetricFindings(analyzerName, module),
    ),
    ...listOf(fieldOf(report, 'packages')).flatMap((packageMetric) =>
      packageMetricFindings(analyzerName, packageMetric),
    ),
    ...listOf(fieldOf(report, 'stabilityDirection')).flatMap((direction) =>
      stabilityFindings({ analyzerName, direction }),
    ),
  ];
}

function stabilityFindings({
  analyzerName,
  direction,
}: {
  readonly analyzerName: string;
  readonly direction: unknown;
}): Finding[] {
  const source = textOf(fieldOf(direction, SOURCE));
  const target = textOf(fieldOf(direction, TARGET));
  const cause = fieldOf(direction, 'cause');
  const message = textOf(
    fieldOf(direction, 'message') ?? `${source} depends on less stable package ${target}`,
  );
  const identity = `package-edge:${source}->${target}`;
  return [
    {
      tool: analyzerName,
      rule: RULE_IDS.stabilityDirection,
      path: textOf(fieldOf(direction, 'path') ?? source),
      identity,
      message,
      classification: 'enforceable',
      ...(cause === undefined ? {} : { cause }),
    },
    ...metricFindings({
      analyzerName,
      rule: 'stability-direction-metric',
      path: '.',
      identity,
      message,
      metricName: 'instabilityDelta',
      value: fieldOf(direction, 'delta'),
    }),
  ];
}

function instabilityOf(fanIn: number, fanOut: number): number | undefined {
  return fanIn + fanOut === 0 ? undefined : rounded(fanOut / (fanIn + fanOut));
}

function distinct(
  list: readonly Edge[],
  predicate: (edge: Edge) => boolean,
  side: EdgeSide,
): number {
  return new Set(list.filter(predicate).map((edge) => edge[side])).size;
}

type MetricContext = {
  readonly edges: readonly Edge[];
  readonly packageOf: (name: string) => string;
};
type ModuleContext = MetricContext & { readonly runtime: true | undefined };

function moduleMetric(name: string, { edges, packageOf, runtime }: ModuleContext): ModuleMetric {
  const fanIn = distinct(edges, (edge) => edge.target === name, SOURCE);
  const fanOut = distinct(edges, (edge) => edge.source === name, TARGET);
  const metrics: ModuleMetric = {
    module: name,
    package: packageOf(name),
    fanIn,
    fanOut,
    totalCoupling: fanIn + fanOut,
    instability: instabilityOf(fanIn, fanOut),
  };
  if (!runtime) {
    return metrics;
  }
  const runtimeEdges = edges.filter((edge) => edge.kind === 'runtime');
  const runtimeFanIn = distinct(runtimeEdges, (edge) => edge.target === name, SOURCE);
  const runtimeFanOut = distinct(runtimeEdges, (edge) => edge.source === name, TARGET);
  return {
    ...metrics,
    runtimeFanIn,
    runtimeFanOut,
    runtimeInstability: instabilityOf(runtimeFanIn, runtimeFanOut),
  };
}

function packageMetric(
  name: string,
  members: readonly string[],
  { edges, packageOf }: MetricContext,
): PackageMetric {
  const internal = edges.filter(
    (edge) => packageOf(edge.source) === name && packageOf(edge.target) === name,
  );
  const fanIn = distinct(
    edges,
    (edge) => packageOf(edge.source) !== name && packageOf(edge.target) === name,
    SOURCE,
  );
  const fanOut = distinct(
    edges,
    (edge) => packageOf(edge.source) === name && packageOf(edge.target) !== name,
    TARGET,
  );
  const componentSizes = connectedComponentSizes(members, internal);
  const possibleInternalEdges = members.length * Math.max(members.length - 1, 0);
  return {
    name,
    modules: members.length,
    fanIn,
    fanOut,
    instability: instabilityOf(fanIn, fanOut),
    cohesion: {
      internalEdges: internal.length,
      edgeDensity:
        possibleInternalEdges === 0 ? undefined : rounded(internal.length / possibleInternalEdges),
      connectedComponents: componentSizes.length,
      largestComponentShare:
        members.length === 0 ? undefined : rounded((componentSizes[0] ?? 0) / members.length),
    },
  };
}

export function computeCoupling({
  modules,
  edges,
  packageOf,
  runtime,
  ...stability
}: CouplingInput): CouplingMetrics {
  const moduleMetrics = modules.map((name) => moduleMetric(name, { edges, packageOf, runtime }));
  const packages: PackageMetric[] = [...new Set(modules.map(packageOf))]
    .map((name) =>
      packageMetric(
        name,
        modules.filter((module) => packageOf(module) === name),
        { edges, packageOf },
      ),
    )
    .sort((left, right) => left.name.localeCompare(right.name));
  const stabilityDirection = stabilityDirections({ modules, edges, packageOf, ...stability });
  return { modules: moduleMetrics, packages, stabilityDirection };
}

function byName(left: { readonly name: string }, right: { readonly name: string }): number {
  if (left.name < right.name) {
    return -1;
  }
  return left.name > right.name ? 1 : 0;
}

export function buildCouplingReport<File extends string | undefined>({
  modules,
  edges,
  packageOf,
  fileOf,
  roleOf,
}: ReportInput<File>): CouplingReport<File> {
  const moduleSet = new Set(modules);
  const moduleEdges = new Map<string, Edge>();
  for (const { source, target, kind = 'runtime' } of edges) {
    const key = JSON.stringify([source, target]);
    if (source !== target && moduleSet.has(source) && moduleSet.has(target)) {
      const seen = moduleEdges.get(key);
      moduleEdges.set(key, { source, target, kind: seen?.kind === 'runtime' ? 'runtime' : kind });
    }
  }
  const allEdges = [...moduleEdges.values()];
  const metrics = computeCoupling({ modules, edges: allEdges, packageOf, roleOf, fileOf });
  const packages = metrics.packages.sort(byName);
  return {
    summary: {
      modules: modules.length,
      dependencies: allEdges.length,
      packages: packages.length,
    },
    modules: metrics.modules.map(({ module, fanIn, fanOut, totalCoupling, instability }) => ({
      file: fileOf(module),
      fanIn,
      fanOut,
      totalCoupling,
      instability,
    })),
    packages,
    stabilityDirection: metrics.stabilityDirection.map(reportedDirection),
  };
}
