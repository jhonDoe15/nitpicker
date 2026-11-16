import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { RULE_IDS } from '../../../../shared/policy.mjs';
import {
  buildCouplingReport as untypedBuildReport,
  evaluateCoupling,
} from '../../../../shared/rules/coupling.mjs';
import { PUBLIC_FACES } from '../../../../shared/rules/features/feature-roles.mjs';
import { listOtherModules, listProductionModules } from './python-sources.mts';
import { fileURLToPath } from 'node:url';
import type { IngestedFinding } from '../../ingest/typed/ingest-types.mts';
import { entryOf } from '../imports/typed/import-rule-types.mts';
import {
  isImportsByFile,
  isImportsReport,
  type CouplingInput,
  type CouplingOptions,
  type CouplingReport,
  type StdoutRun,
  type ScanContext,
} from './typed/coupling-types.mts';
import type {
  ImportEdge,
  ImportStatement,
  ImportsByFile,
  ImportsReport,
  OtherModule,
  PythonModule,
} from './typed/python-graph-types.mts';
import { featureRoleContract } from './typed/shared-views.mts';

const buildReport: (input: {
  modules: string[];
  edges: ImportEdge[];
  packageOf: (name: string) => string;
  fileOf: (name: string) => string;
  roleOf: (name: string) => unknown;
}) => CouplingReport = untypedBuildReport;
const evaluate: (report: CouplingReport, tool: string) => IngestedFinding[] = evaluateCoupling;
const IMPORTS_REPORT = 'imports.json';
const COUPLING_FAILED_RULE = 'coupling-failed';
const COUPLING_TOOL = 'coupling';
const SCAN_SCRIPT = path.join(fileURLToPath(new URL('../', import.meta.url)), 'import-scan.py');
const SCAN_REQUEST = 'import-scan-request.json';
const ROOT_PACKAGE = '(root)';
const TYPE_ONLY = 'type-only';

export function collectImports<Context extends ScanContext>(
  context: Context,
  run: StdoutRun<Context>,
): { modules: PythonModule[]; others: OtherModule[]; imports: ImportsByFile } {
  const { projectRoot, reportRoot } = context;
  const modules = listProductionModules(projectRoot, context.project.sourceRoots);
  const others = listOtherModules(projectRoot, context.project.sourceRoots, modules);
  let imports: ImportsByFile = {};
  if (modules.length + others.length > 0) {
    const request = path.join(reportRoot, SCAN_REQUEST);
    const files = [...modules, ...others].map(({ file }) => file);
    writeFileSync(request, JSON.stringify({ root: projectRoot, files }));
    const result = run(context, ['python', '-I', SCAN_SCRIPT, request], {
      rule: COUPLING_FAILED_RULE,
    });
    const scanned: unknown = JSON.parse(result.stdout);
    if (!isImportsByFile(scanned)) {
      throw new TypeError('The import scan report is malformed');
    }
    imports = scanned;
  }
  return { modules, others, imports };
}

export function scanImports<Context extends ScanContext>(
  context: Context,
  run: StdoutRun<Context>,
): void {
  writeFileSync(
    path.join(context.reportRoot, IMPORTS_REPORT),
    JSON.stringify(collectImports(context, run)),
  );
}

function parentOf(name: string): string {
  return name.slice(0, Math.max(0, name.lastIndexOf('.')));
}

export function longestKnownPrefix(name: string, known: ReadonlySet<string>): string | undefined {
  const parts = name.split('.');
  return parts
    .map((_, index) => parts.slice(0, parts.length - index).join('.'))
    .find((candidate) => known.has(candidate));
}

function relativeBase(
  importer: PythonModule,
  { level, module }: ImportStatement,
): string | undefined {
  const owner = importer.isPackage ? importer.module : parentOf(importer.module);
  const segments = owner === '' ? [] : owner.split('.');
  if (level - 1 > segments.length) {
    return undefined;
  }
  return [...segments.slice(0, segments.length - (level - 1)), ...(module ?? '').split('.')]
    .filter(Boolean)
    .join('.');
}

export const WHOLE_MODULE = '*';

export function statementTargets(
  importer: PythonModule,
  statement: ImportStatement,
  known: ReadonlySet<string>,
): { target: string | undefined; name: string }[] {
  if (statement.level === 0 && statement.module === null) {
    return statement.names.map((name) => ({
      target: longestKnownPrefix(name, known),
      name: WHOLE_MODULE,
    }));
  }
  const base =
    statement.level === 0 ? (statement.module ?? undefined) : relativeBase(importer, statement);
  if (base === undefined) {
    return [];
  }
  return statement.names.map((name) => {
    const submodule = base === '' ? name : `${base}.${name}`;
    return known.has(submodule)
      ? { target: submodule, name: WHOLE_MODULE }
      : { target: longestKnownPrefix(base, known), name };
  });
}

export function importedModules(
  importer: PythonModule,
  statement: ImportStatement,
  known: ReadonlySet<string>,
): (string | undefined)[] {
  return statementTargets(importer, statement, known).map(({ target }) => target);
}

export function importEdges(
  modules: readonly PythonModule[],
  imports: ImportsByFile,
): ImportEdge[] {
  const known = new Set(modules.map(({ module }) => module));
  return modules.flatMap((importer) =>
    (imports[importer.file] ?? [])
      .filter(({ exported }) => exported !== true)
      .flatMap((statement) =>
        statementTargets(importer, statement, known)
          .map(({ target }) => target)
          .filter((target) => target !== undefined)
          .map((target) => ({
            source: importer.module,
            target,
            kind: statement.typeOnly === true ? TYPE_ONLY : 'runtime',
          })),
      ),
  );
}

function packageOwner(entry: PythonModule): string {
  const owner = entry.isPackage ? entry.module : parentOf(entry.module);
  return owner === '' ? ROOT_PACKAGE : owner;
}

export function analyzePythonCoupling(
  { modules, imports }: CouplingInput,
  { layout }: CouplingOptions = {},
): CouplingReport {
  const byName = new Map(modules.map((entry) => [entry.module, entry]));
  const roleOfFile = featureRoleContract(layout, PUBLIC_FACES.python);
  return buildReport({
    modules: [...byName.keys()].sort(),
    edges: importEdges(modules, imports),
    packageOf: (name: string) => packageOwner(entryOf(byName, name)),
    fileOf: (name: string) => entryOf(byName, name).file,
    roleOf: (name: string) => roleOfFile(entryOf(byName, name).file),
  });
}

function packageAnchors(modules: readonly PythonModule[]): Map<string, string> {
  const anchors = new Map<string, string>();
  for (const entry of [...modules].sort((left, right) => left.file.localeCompare(right.file))) {
    const owner = packageOwner(entry);
    if (!anchors.has(owner) || (entry.isPackage && entry.module === owner)) {
      anchors.set(owner, entry.file);
    }
  }
  return anchors;
}

function withStabilityAnchor(
  findings: readonly IngestedFinding[],
  { report, modules }: { report: CouplingReport; modules: readonly PythonModule[] },
): IngestedFinding[] {
  const anchors = packageAnchors(modules);
  const sources = new Map(
    report.stabilityDirection
      .filter((direction) => direction.path === undefined)
      .map((direction) => [`package-edge:${direction.source}->${direction.target}`, direction]),
  );
  return findings.map((finding) => {
    const direction =
      finding.rule === RULE_IDS.stabilityDirection ? sources.get(finding.identity) : undefined;
    if (direction === undefined) {
      return finding;
    }
    const message =
      direction.message === undefined
        ? `${finding.message}. Depend on an abstraction in a more stable package instead.`
        : finding.message;
    return { ...finding, path: anchors.get(direction.source) ?? finding.path, message };
  });
}

export function readImportsReport(reportRoot: string): ImportsReport {
  const report: unknown = JSON.parse(readFileSync(path.join(reportRoot, IMPORTS_REPORT), 'utf8'));
  if (!isImportsReport(report)) {
    throw new TypeError('The imports report is malformed');
  }
  return report;
}

export function readCouplingFindings(
  reportRoot: string,
  { layout }: CouplingOptions = {},
): IngestedFinding[] {
  const imports = readImportsReport(reportRoot);
  const report = analyzePythonCoupling(imports, { layout });
  return withStabilityAnchor(evaluate(report, COUPLING_TOOL), {
    report,
    modules: imports.modules,
  });
}
