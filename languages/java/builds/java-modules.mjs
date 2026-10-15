import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readJavaFindings } from '../adapters/reporting/java-reports.mjs';
import { projectWideFindings } from './project-wide.mjs';

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

export function moduleReport(moduleDir, reportDirectory) {
  const reportRoot = path.join(moduleDir, reportDirectory);
  const manifest = readManifest(moduleDir, reportDirectory);
  return {
    reportBase: reportRoot,
    report: { modules: [{ key: 'root', path: ':', dir: '', reportRoot, manifest }], manifest },
  };
}

function readModule(moduleDir, options) {
  return readJavaFindings(moduleDir, {
    ...options,
    ...moduleReport(moduleDir, options.reportDirectory),
  }).findings;
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

export function readModuleFindings(projectRoot, moduleDirs, options) {
  if (moduleDirs.length === 1 && path.resolve(moduleDirs[0]) === path.resolve(projectRoot)) {
    return readModule(projectRoot, options);
  }
  const moduleFindings = moduleDirs.flatMap((moduleDir) => {
    const prefix = prefixOf(projectRoot, moduleDir);
    return readModule(moduleDir, { ...options, projectWide: false }).map((finding) => ({
      ...finding,
      path: prefixed(prefix, finding.path),
    }));
  });
  const roots = mergedRoots(projectRoot, moduleDirs, options.reportDirectory);
  return [
    ...moduleFindings,
    ...projectWideFindings(projectRoot, {
      reportRoots: moduleDirs.map((moduleDir) => path.join(moduleDir, options.reportDirectory)),
      mergedRoot: path.join(projectRoot, options.reportDirectory),
      manifest: roots,
      kotlin: false,
      policy: options,
    }),
  ];
}
