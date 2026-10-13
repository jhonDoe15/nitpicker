import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { RULE_IDS } from '../../../shared/policy.mjs';
import { buildCouplingReport, evaluateCoupling } from '../../../shared/rules/coupling.mjs';
import { listProductionModules } from './python-sources.mjs';

const IMPORTS_REPORT = 'imports.json';
const COUPLING_FAILED_RULE = 'coupling-failed';
const COUPLING_TOOL = 'coupling';
const SCAN_SCRIPT = path.join(import.meta.dirname, 'import-scan.py');
const SCAN_REQUEST = 'import-scan-request.json';
const ROOT_PACKAGE = '(root)';

export function collectImports(context, run) {
  const { projectRoot, reportRoot } = context;
  const modules = listProductionModules(projectRoot, context.project.sourceRoots);
  let imports = {};
  if (modules.length > 0) {
    const request = path.join(reportRoot, SCAN_REQUEST);
    writeFileSync(
      request,
      JSON.stringify({ root: projectRoot, files: modules.map(({ file }) => file) }),
    );
    const result = run(context, ['python', '-I', SCAN_SCRIPT, request], {
      rule: COUPLING_FAILED_RULE,
    });
    imports = JSON.parse(result.stdout);
  }
  return { modules, imports };
}

export function scanImports(context, run) {
  writeFileSync(
    path.join(context.reportRoot, IMPORTS_REPORT),
    JSON.stringify(collectImports(context, run)),
  );
}

function parentOf(name) {
  return name.slice(0, Math.max(0, name.lastIndexOf('.')));
}

function longestKnownPrefix(name, known) {
  const parts = name.split('.');
  return parts
    .map((_, index) => parts.slice(0, parts.length - index).join('.'))
    .find((candidate) => known.has(candidate));
}

function relativeBase(importer, { level, module }) {
  const owner = importer.isPackage ? importer.module : parentOf(importer.module);
  const segments = owner === '' ? [] : owner.split('.');
  if (level - 1 > segments.length) {
    return undefined;
  }
  return [...segments.slice(0, segments.length - (level - 1)), ...(module ?? '').split('.')]
    .filter(Boolean)
    .join('.');
}

function importedModules(importer, statement, known) {
  if (statement.level === 0 && statement.module === null) {
    return statement.names.map((name) => longestKnownPrefix(name, known));
  }
  const base = statement.level === 0 ? statement.module : relativeBase(importer, statement);
  if (base === undefined) {
    return [];
  }
  return statement.names.map((name) => {
    const submodule = base === '' ? name : `${base}.${name}`;
    return known.has(submodule) ? submodule : longestKnownPrefix(base, known);
  });
}

export function importEdges(modules, imports) {
  const known = new Set(modules.map(({ module }) => module));
  return modules.flatMap((importer) =>
    (imports[importer.file] ?? [])
      .flatMap((statement) => importedModules(importer, statement, known))
      .filter((target) => target !== undefined)
      .map((target) => ({ source: importer.module, target })),
  );
}

function packageOwner(entry) {
  const owner = entry.isPackage ? entry.module : parentOf(entry.module);
  return owner === '' ? ROOT_PACKAGE : owner;
}

export function analyzePythonCoupling({ modules, imports }) {
  const byName = new Map(modules.map((entry) => [entry.module, entry]));
  return buildCouplingReport({
    modules: [...byName.keys()].sort(),
    edges: importEdges(modules, imports),
    packageOf: (name) => packageOwner(byName.get(name)),
    fileOf: (name) => byName.get(name).file,
  });
}

function packageAnchors(modules) {
  const anchors = new Map();
  for (const entry of [...modules].sort((left, right) => left.file.localeCompare(right.file))) {
    const owner = packageOwner(entry);
    if (!anchors.has(owner) || (entry.isPackage && entry.module === owner)) {
      anchors.set(owner, entry.file);
    }
  }
  return anchors;
}

function withStabilityRoute(findings, { report, modules }) {
  const anchors = packageAnchors(modules);
  const sources = new Map(
    report.stabilityDirection.map((direction) => [
      `package-edge:${direction.source}->${direction.target}`,
      direction.source,
    ]),
  );
  return findings.map((finding) => {
    const source =
      finding.rule === RULE_IDS.stabilityDirection ? sources.get(finding.identity) : undefined;
    if (source === undefined) {
      return finding;
    }
    const file = anchors.get(source);
    return {
      ...finding,
      path: file,
      message: `${finding.message}. Depend on an abstraction in a more stable package instead, or, if the inversion is intended, add ${file} to "exclude" in nitpicker.config.json.`,
    };
  });
}

export function readImportsReport(reportRoot) {
  return JSON.parse(readFileSync(path.join(reportRoot, IMPORTS_REPORT), 'utf8'));
}

export function readCouplingFindings(reportRoot) {
  const imports = readImportsReport(reportRoot);
  const report = analyzePythonCoupling(imports);
  return withStabilityRoute(evaluateCoupling(report, COUPLING_TOOL), {
    report,
    modules: imports.modules,
  });
}
