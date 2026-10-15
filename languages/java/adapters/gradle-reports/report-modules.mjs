import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MODULES_FILE = 'modules.json';
const MANIFEST_FILE = 'manifest.json';
const JACOCO_FILE = 'jacoco.xml';
const MAIN_CLASSES_FILE = 'jdeps-classes.txt';
const CHECKSTYLE_FILE = 'checkstyle.xml';
const SOURCE_EXTENSIONS = ['.java', '.kt'];
const EMPTY_JACOCO_REPORT = '<report name="no main classes"></report>';
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

function mergeManifests(modules) {
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

function hasMainClasses(reportRoot) {
  const file = path.join(reportRoot, MAIN_CLASSES_FILE);
  return existsSync(file) && readFileSync(file, 'utf8').trim() !== '';
}

export function readModuleJacoco(module, preset) {
  const file = path.join(module.reportRoot, JACOCO_FILE);
  if (existsSync(file)) {
    return readFileSync(file, 'utf8');
  }
  if (!hasMainClasses(module.reportRoot)) {
    return EMPTY_JACOCO_REPORT;
  }
  throw new Error(`The ${preset} preset found no JaCoCo report for ${moduleLabel(module)}`);
}

function hasSourceFiles(projectRoot, roots, extensions) {
  return roots.some((root) => {
    const directory = path.join(projectRoot, root);
    return (
      existsSync(directory) &&
      readdirSync(directory, { recursive: true }).some((name) =>
        extensions.some((extension) => String(name).endsWith(extension)),
      )
    );
  });
}

export function isEmptyModule(projectRoot, module) {
  const roots = ROOT_LISTS.flatMap((list) => module.manifest[list] ?? []);
  return (
    !hasMainClasses(module.reportRoot) && !hasSourceFiles(projectRoot, roots, SOURCE_EXTENSIONS)
  );
}

export function readMainCheckstyle(projectRoot, module, preset) {
  const file = path.join(module.reportRoot, CHECKSTYLE_FILE);
  if (existsSync(file)) {
    return readFileSync(file, 'utf8');
  }
  if (!hasSourceFiles(projectRoot, module.manifest.sourceRoots ?? [], ['.java'])) {
    return undefined;
  }
  throw new Error(`The ${preset} preset found no Checkstyle report for ${moduleLabel(module)}`);
}
