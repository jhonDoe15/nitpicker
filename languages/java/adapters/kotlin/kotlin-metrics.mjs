import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ingestCrapFunctions } from '../../ingest/crap.mjs';
import { MESSAGES, RULE_IDS } from '../../../../shared/policy.mjs';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { methodText, structureFindings } from '../../../../shared/ingest/structure-report.mjs';

const METRICS_REPORT = 'kotlin-metrics.json';
const DEFAULT_ARGUMENTS_SUFFIX = '$default';

export function readKotlinMetrics(reportRoot) {
  const report = path.join(reportRoot, METRICS_REPORT);
  return existsSync(report)
    ? JSON.parse(readFileSync(report, 'utf8'))
    : { functions: [], files: [] };
}

function repeatsInClass(entry) {
  return entry.name.endsWith('<init>');
}

const RETURN_EARLY = 'Return early instead of nesting.';
const EXTRACT_NESTED = 'Move the nested part into its own function.';

function adviseInitializers(findings, functions) {
  const initializers = new Set(
    functions.filter(({ initializer }) => initializer === true).map(({ name }) => name),
  );
  return findings.map((finding) =>
    finding.rule === RULE_IDS.functionControlNesting && initializers.has(finding.symbol)
      ? { ...finding, message: finding.message.replace(RETURN_EARLY, EXTRACT_NESTED) }
      : finding,
  );
}

export function readKotlinStructureFindings(metrics, projectRoot) {
  return adviseInitializers(
    structureFindings(
      metrics.functions.map((entry) => ({
        ...entry,
        numberedAmongSameSource: repeatsInClass(entry),
      })),
      projectRoot,
    ),
    metrics.functions,
  );
}

export function selectKotlinMethods(fn, candidates, siblings) {
  const inner = siblings.filter(
    (other) =>
      other !== fn &&
      other.start >= fn.start &&
      other.end <= fn.end &&
      (other.start > fn.start || other.end < fn.end),
  );
  return withoutStaticBridges(
    candidates.filter(
      (method) =>
        !method.name.endsWith(DEFAULT_ARGUMENTS_SUFFIX) &&
        method.line >= fn.start &&
        method.line <= fn.end &&
        !inner.some((other) => method.line >= other.start && method.line <= other.end),
    ),
  );
}

function withoutStaticBridges(methods) {
  const deepest = Map.groupBy(methods, (method) => `${method.name}:${String(method.line)}`);
  return methods.filter((method) => {
    const group = deepest.get(`${method.name}:${String(method.line)}`);
    return !group.some(
      (other) =>
        other.className !== method.className && other.className.startsWith(`${method.className}$`),
    );
  });
}

function jacocoKeys(metrics) {
  const keys = new Map(
    metrics.files.map(({ file, package: packageName }) => [
      file,
      [packageName.replaceAll('.', '/'), path.posix.basename(file)].filter(Boolean).join('/'),
    ]),
  );
  return (file) => (keys.has(file) ? [keys.get(file)] : []);
}

export function readKotlinCrapFindings(metrics, { projectRoot, jacoco, crapLimit }) {
  const sources = new Map();
  const functions = metrics.functions
    .filter((entry) => !entry.inline)
    .map((entry) => ({
      ccn: entry.complexity,
      file: entry.file,
      name: entry.name,
      longName: entry.name,
      start: entry.start,
      end: entry.end,
      lineScoped: entry.initializer === true,
      numberedAmongSameSource: repeatsInClass(entry),
    }));
  return ingestCrapFunctions(functions, jacoco, {
    jacocoKeys: jacocoKeys(metrics),
    limit: crapLimit,
    unknownMessage: MESSAGES.crapCoverageUnknownPlain,
    selectMethods: selectKotlinMethods,
    sourceHash: (entry) =>
      existsSync(path.join(projectRoot, entry.file))
        ? hash(methodText(sources, projectRoot, entry))
        : undefined,
  }).findings;
}

export function kotlinModules(metrics) {
  const moduleOf = new Map();
  const fileOf = new Map();
  for (const { file, classes } of metrics.files) {
    const [representative] = [...classes].sort();
    for (const name of classes) {
      moduleOf.set(name, representative);
    }
    if (representative !== undefined) {
      fileOf.set(representative, file);
    }
  }
  return { moduleOf, fileOf };
}
