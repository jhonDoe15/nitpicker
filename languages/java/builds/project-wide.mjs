import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readCouplingFindings } from '../adapters/metrics/java-coupling.mjs';
import { readJavaFileLimitFindings } from '../adapters/metrics/java-structure.mjs';
import { kotlinModules, readKotlinMetrics } from '../adapters/kotlin/kotlin-metrics.mjs';

const COUPLING_REPORTS = ['jdeps.txt', 'jdeps-classes.txt'];

function couplingRoot(reportRoots, mergedRoot) {
  const complete = reportRoots.filter((reportRoot) =>
    COUPLING_REPORTS.every((name) => existsSync(path.join(reportRoot, name))),
  );
  if (complete.length < 2) {
    return complete[0];
  }
  mkdirSync(mergedRoot, { recursive: true });
  for (const name of COUPLING_REPORTS) {
    writeFileSync(
      path.join(mergedRoot, name),
      complete.map((reportRoot) => readFileSync(path.join(reportRoot, name), 'utf8')).join('\n'),
    );
  }
  return mergedRoot;
}

function couplingFindings(projectRoot, { reportRoots, mergedRoot, manifest, kotlin }) {
  const reportRoot = couplingRoot(reportRoots, mergedRoot);
  if (reportRoot === undefined) {
    return [];
  }
  return readCouplingFindings(reportRoot, {
    projectRoot,
    sourceRoots: manifest.sourceRoots ?? [],
    kotlin: kotlin
      ? kotlinModules({ files: reportRoots.flatMap((root) => readKotlinMetrics(root).files) })
      : undefined,
  });
}

export function projectWideFindings(
  projectRoot,
  { reportRoots, mergedRoot, manifest, kotlin, policy },
) {
  return [
    ...readJavaFileLimitFindings(projectRoot, {
      manifest,
      kotlin,
      policy: {
        thresholds: policy.fileLimits,
        exclude: policy.exclude,
        exceptions: policy.exceptions,
      },
    }),
    ...couplingFindings(projectRoot, { reportRoots, mergedRoot, manifest, kotlin }),
  ];
}
