import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const MODULES_FILE = 'modules.json';
const MANIFEST_FILE = 'manifest.json';
const ROOT_LISTS = [
  'sourceRoots',
  'testSourceRoots',
  'resourceRoots',
  'kotlinSourceRoots',
  'kotlinTestSourceRoots',
];

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function moduleLabel({ path: projectPath, dir }) {
  return dir === '' ? `project ${projectPath}` : `project ${projectPath} (${dir})`;
}

export function mergeManifests(modules) {
  const declared = ROOT_LISTS.filter((list) =>
    modules.some(({ manifest }) => Array.isArray(manifest[list])),
  );
  return {
    ...Object.fromEntries(
      declared.map((list) => [
        list,
        [...new Set(modules.flatMap(({ manifest }) => manifest[list] ?? []))],
      ]),
    ),
    spring: modules.some(({ manifest }) => manifest.spring === true),
    kotlin: modules.some(({ manifest }) => manifest.kotlin === true),
  };
}

export function readReportModules(reportBase, preset) {
  const listFile = path.join(reportBase, MODULES_FILE);
  const listed = existsSync(listFile) ? readJson(listFile) : [];
  if (listed.length === 0) {
    const plugin = preset === 'kotlin' ? 'org.jetbrains.kotlin.jvm' : 'java';
    throw new Error(
      `The ${preset} preset found no Gradle project that applies the ${plugin} plugin`,
    );
  }
  const modules = listed
    .toSorted((left, right) => left.key.localeCompare(right.key))
    .map((entry) => {
      const reportRoot = path.join(reportBase, entry.key);
      const manifestFile = path.join(reportRoot, MANIFEST_FILE);
      if (!existsSync(manifestFile)) {
        throw new Error(
          `The ${preset} preset found no Gradle reports for ${moduleLabel(entry)}: its nitpickerJava task did not run`,
        );
      }
      return { ...entry, reportRoot, manifest: readJson(manifestFile) };
    });
  return { modules, manifest: mergeManifests(modules) };
}
