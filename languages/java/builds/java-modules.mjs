import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readJavaFindings } from '../adapters/reporting/java-reports.mjs';
import { retargetSentence } from '../../../shared/exceptions/sentence.mjs';
import { inModule } from './module-path.mjs';
import { projectWideFindings } from './project-wide.mjs';

function prefixOf(projectRoot, moduleDir) {
  return path.relative(projectRoot, moduleDir).replaceAll('\\', '/');
}

export function prefixedFinding(finding, prefix) {
  const findingPath = inModule(prefix, finding.path);
  function retarget(text) {
    return text === undefined ? text : retargetSentence(text, finding.path, findingPath);
  }
  const { ratchet } = finding;
  return {
    ...finding,
    path: findingPath,
    message: retarget(finding.message),
    ...(ratchet === undefined
      ? {}
      : {
          ratchet: {
            ...ratchet,
            heldMessage: retarget(ratchet.heldMessage),
            worseMessage: retarget(ratchet.worseMessage),
          },
        }),
  };
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
    roots.sourceRoots.push(...(manifest.sourceRoots ?? []).map((root) => inModule(prefix, root)));
    roots.testSourceRoots.push(
      ...(manifest.testSourceRoots ?? []).map((root) => inModule(prefix, root)),
    );
  }
  return roots;
}

export function readModuleFindings(projectRoot, moduleDirs, options) {
  if (moduleDirs.length === 1 && path.resolve(moduleDirs[0]) === path.resolve(projectRoot)) {
    return readModule(projectRoot, { ...options, modulePath: '' });
  }
  const moduleFindings = moduleDirs.flatMap((moduleDir) => {
    const prefix = prefixOf(projectRoot, moduleDir);
    return readModule(moduleDir, { ...options, projectWide: false, modulePath: prefix }).map(
      (finding) => prefixedFinding(finding, prefix),
    );
  });
  const roots = mergedRoots(projectRoot, moduleDirs, options.reportDirectory);
  return [
    ...moduleFindings,
    ...projectWideFindings(projectRoot, {
      projects: moduleDirs.map((moduleDir) => ({
        reportRoot: path.join(moduleDir, options.reportDirectory),
        qualifier: prefixOf(projectRoot, moduleDir),
        sourceRoots: (readManifest(moduleDir, options.reportDirectory).sourceRoots ?? []).map(
          (root) => inModule(prefixOf(projectRoot, moduleDir), root),
        ),
      })),
      mergedRoot: path.join(projectRoot, options.reportDirectory),
      manifest: roots,
      kotlin: false,
      policy: options,
    }),
  ];
}
