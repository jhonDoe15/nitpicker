import path from 'node:path';
import { RULE_IDS } from '../../../../shared/policy.mjs';
import { directoryOf, goPackages } from '../typed/go-readers.mts';
import { buildCouplingReport, evaluateCoupling } from '../typed/shared-readers.mts';
import type { FindingRow, GoFile, InspectReport } from '../go-types.mts';

type CouplingReport = Pick<InspectReport, 'files' | 'usages'>;

const COUPLING_TOOL = 'coupling';
const ROOT_PACKAGE = '.';
const PACKAGE_DOC = 'doc.go';
const STABILITY_HINT = 'Depend on an interface the more stable package owns instead.';

function unitOf(directory: string) {
  return directory === '' ? ROOT_PACKAGE : directory;
}

function anchorRank(file: GoFile) {
  if (path.posix.basename(file.path) === PACKAGE_DOC) {
    return 0;
  }
  return file.generated ? 2 : 1;
}

function anchors(files: readonly GoFile[]) {
  const byPackage = new Map<string, string>();
  const ranked = files.toSorted(
    (left: GoFile, right: GoFile) =>
      anchorRank(left) - anchorRank(right) || left.path.localeCompare(right.path),
  );
  for (const file of ranked) {
    const unit = unitOf(directoryOf(file.path));
    if (!byPackage.has(unit)) {
      byPackage.set(unit, file.path);
    }
  }
  return byPackage;
}

function goCouplingReport(report: CouplingReport, module: string) {
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
    modules: [...anchorOf.keys()].toSorted((left, right) => left.localeCompare(right)),
    edges,
    roleOf: undefined,
    packageOf: (unit: string) => unit,
    fileOf: (unit: string) => anchorOf.get(unit),
  });
  return { coupling, anchorOf };
}

export function goCouplingFindings(report: CouplingReport, module: string): FindingRow[] {
  const { coupling, anchorOf } = goCouplingReport(report, module);
  return evaluateCoupling(coupling, COUPLING_TOOL).map((finding) => {
    if (finding.rule !== RULE_IDS.stabilityDirection) {
      return finding;
    }
    const direction = coupling.stabilityDirection.find(
      ({ source, target }) => finding.identity === `package-edge:${source}->${target}`,
    );
    if (direction === undefined) {
      return finding;
    }
    return {
      ...finding,
      path: anchorOf.get(direction.source) ?? finding.path,
      message: `Package ${finding.message}. ${STABILITY_HINT}`,
    };
  });
}
