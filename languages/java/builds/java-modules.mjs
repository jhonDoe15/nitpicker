import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readCouplingFindings } from '../adapters/metrics/java-coupling.mjs';
import { readJavaFindings } from '../adapters/reporting/java-reports.mjs';
import { readJavaFileLimitFindings } from '../adapters/metrics/java-structure.mjs';

function prefixOf(projectRoot, moduleDir) {
  return path.relative(projectRoot, moduleDir).replaceAll('\\', '/');
}

function prefixed(prefix, relativePath) {
  if (prefix === '') {
    return relativePath;
  }
  return relativePath === '.' ? prefix : `${prefix}/${relativePath}`;
}

function readManifest(moduleDir, reportDirectory) {
  return JSON.parse(readFileSync(path.join(moduleDir, reportDirectory, 'manifest.json'), 'utf8'));
}

function mergedRoots(projectRoot, moduleDirs, reportDirectory) {
  const roots = { sourceRoots: [], testSourceRoots: [] };
  for (const moduleDir of moduleDirs) {
    const prefix = prefixOf(projectRoot, moduleDir);
    const manifest = readManifest(moduleDir, reportDirectory);
    roots.sourceRoots.push(...(manifest.sourceRoots ?? []).map((root) => prefixed(prefix, root)));
    roots.testSourceRoots.push(
      ...(manifest.testSourceRoots ?? []).map((root) => prefixed(prefix, root)),
    );
  }
  return roots;
}

function mergeModuleReports(moduleDirs, { reportDirectory, reportRoot, name }) {
  writeFileSync(
    path.join(reportRoot, name),
    moduleDirs
      .map((moduleDir) => readFileSync(path.join(moduleDir, reportDirectory, name), 'utf8'))
      .join('\n'),
  );
}

function projectCoupling(projectRoot, moduleDirs, { reportDirectory, sourceRoots }) {
  const reportRoot = path.join(projectRoot, reportDirectory);
  mkdirSync(reportRoot, { recursive: true });
  for (const name of ['jdeps.txt', 'jdeps-classes.txt', 'permits.txt']) {
    mergeModuleReports(moduleDirs, { reportDirectory, reportRoot, name });
  }
  return readCouplingFindings(reportRoot, { projectRoot, sourceRoots });
}

export function readModuleFindings(projectRoot, moduleDirs, options) {
  if (moduleDirs.length === 1 && path.resolve(moduleDirs[0]) === path.resolve(projectRoot)) {
    return readJavaFindings(projectRoot, options).findings;
  }
  const moduleFindings = moduleDirs.flatMap((moduleDir) => {
    const prefix = prefixOf(projectRoot, moduleDir);
    return readJavaFindings(moduleDir, { ...options, projectWide: false }).findings.map(
      (finding) => ({
        ...finding,
        path: prefixed(prefix, finding.path),
      }),
    );
  });
  const roots = mergedRoots(projectRoot, moduleDirs, options.reportDirectory);
  return [
    ...moduleFindings,
    ...readJavaFileLimitFindings(projectRoot, {
      manifest: roots,
      policy: {
        thresholds: options.fileLimits,
        exclude: options.exclude,
        exceptions: options.exceptions,
      },
    }),
    ...projectCoupling(projectRoot, moduleDirs, {
      reportDirectory: options.reportDirectory,
      sourceRoots: roots.sourceRoots,
    }),
  ];
}
