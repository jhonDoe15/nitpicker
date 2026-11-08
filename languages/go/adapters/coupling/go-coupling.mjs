import path from 'node:path';
import { RULE_IDS } from '../../../../shared/policy.mjs';
import { buildCouplingReport, evaluateCoupling } from '../../../../shared/rules/coupling.mjs';
import { directoryOf, goPackages } from '../facts/go-packages.mjs';

const COUPLING_TOOL = 'coupling';
const ROOT_PACKAGE = '.';
const PACKAGE_DOC = 'doc.go';
const STABILITY_HINT = 'Depend on an interface the more stable package owns instead.';

function unitOf(directory) {
  return directory === '' ? ROOT_PACKAGE : directory;
}

function anchors(files) {
  const byPackage = new Map();
  for (const file of files.toSorted((left, right) => left.path.localeCompare(right.path))) {
    const unit = unitOf(directoryOf(file.path));
    const current = byPackage.get(unit);
    if (current === undefined || path.posix.basename(file.path) === PACKAGE_DOC) {
      byPackage.set(unit, file.path);
    }
  }
  return byPackage;
}

function goCouplingReport(report, module) {
  const packages = goPackages(report, module);
  const production = report.files.filter(({ test }) => !test);
  const productionPaths = new Set(production.map(({ path: file }) => file));
  const anchorOf = anchors(production);
  const edges = report.usages
    .filter(({ file }) => productionPaths.has(file))
    .flatMap(({ file, imports }) =>
      imports.flatMap(({ path: importPath }) => {
        const target = packages.directoryOfImport(importPath);
        return target === undefined
          ? []
          : [{ source: unitOf(directoryOf(file)), target: unitOf(target) }];
      }),
    );
  const coupling = buildCouplingReport({
    modules: [...anchorOf.keys()].sort(),
    edges,
    packageOf: (unit) => unit,
    fileOf: (unit) => anchorOf.get(unit),
  });
  return { coupling, anchorOf };
}

export function goCouplingFindings(report, module) {
  const { coupling, anchorOf } = goCouplingReport(report, module);
  return evaluateCoupling(coupling, COUPLING_TOOL).map((finding) => {
    if (finding.rule !== RULE_IDS.stabilityDirection) {
      return finding;
    }
    const direction = coupling.stabilityDirection.find(
      ({ source, target }) => finding.identity === `package-edge:${source}->${target}`,
    );
    return {
      ...finding,
      path: anchorOf.get(direction.source),
      message: `Package ${finding.message}. ${STABILITY_HINT}`,
    };
  });
}
