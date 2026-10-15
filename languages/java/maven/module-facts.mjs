import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { childrenNamed, descendantsNamed, parseXml } from '../ingest/common.mjs';

const SUPPORTED_PACKAGINGS = ['jar', 'war'];
const BUILD_HELPER = 'build-helper-maven-plugin';
const SOURCE_GOALS = new Map([
  ['add-source', 'sourceRoots'],
  ['add-test-source', 'testSourceRoots'],
]);

function valueAt(element, ...names) {
  const found = names.reduce(
    (current, name) => current?.children.find((candidate) => candidate.name === name),
    element,
  );
  const text = found?.text.trim();
  return text === '' ? undefined : text;
}

function helperRoots(build) {
  const plugins = descendantsNamed(build, 'plugin').filter(
    (plugin) => valueAt(plugin, 'artifactId') === BUILD_HELPER,
  );
  const roots = { sourceRoots: [], testSourceRoots: [] };
  for (const execution of plugins.flatMap((plugin) => descendantsNamed(plugin, 'execution'))) {
    const goals = descendantsNamed(execution, 'goal').map((goal) => goal.text.trim());
    const sources = descendantsNamed(execution, 'source').map((source) => source.text.trim());
    for (const goal of goals) {
      roots[SOURCE_GOALS.get(goal)]?.push(...sources);
    }
  }
  return roots;
}

function describeProject(project) {
  const build = childrenNamed(project, 'build')[0];
  const extra = helperRoots(build ?? project);
  return {
    groupId: valueAt(project, 'groupId') ?? valueAt(project, 'parent', 'groupId'),
    artifactId: valueAt(project, 'artifactId'),
    packaging: valueAt(project, 'packaging') ?? 'jar',
    buildDirectory: valueAt(build, 'directory'),
    classesDirectory: valueAt(build, 'outputDirectory'),
    testClassesDirectory: valueAt(build, 'testOutputDirectory'),
    declaredSourceRoots: [valueAt(build, 'sourceDirectory'), ...extra.sourceRoots],
    declaredTestRoots: [valueAt(build, 'testSourceDirectory'), ...extra.testSourceRoots],
    declaredResourceRoots: descendantsNamed(
      childrenNamed(build ?? project, 'resources')[0] ?? project,
      'directory',
    ).map((directory) => directory.text.trim()),
  };
}

export function parseEffectivePom(text) {
  const root = parseXml(text);
  const projects = root.name === 'projects' ? childrenNamed(root, 'project') : [root];
  return projects.map(describeProject);
}

function isInside(directory, parent) {
  const relative = path.relative(parent, directory);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function ancestorsWithin(directory, projectRoot) {
  const relative = path.relative(projectRoot, directory);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return [];
  }
  const segments = relative === '' ? [] : relative.split(path.sep);
  return [...segments.keys(), segments.length].map((count) =>
    path.join(projectRoot, ...segments.slice(0, segments.length - count)),
  );
}

function enclosingPom(directory, projectRoot) {
  return ancestorsWithin(directory, projectRoot).find((candidate) =>
    existsSync(path.join(candidate, 'pom.xml')),
  );
}

function locateBasedir(project, projectRoot) {
  const anchors = [
    ...project.declaredSourceRoots,
    ...project.declaredTestRoots,
    project.buildDirectory,
  ].filter((anchor) => anchor !== undefined && path.isAbsolute(anchor));
  const basedir = anchors
    .map((anchor) => enclosingPom(path.dirname(anchor), projectRoot))
    .find((directory) => directory !== undefined);
  if (basedir === undefined) {
    throw new Error(
      `Could not find the directory of Maven module ${project.groupId}:${project.artifactId} under ${projectRoot}`,
    );
  }
  return basedir;
}

function containsJava(directory) {
  return (
    existsSync(directory) &&
    readdirSync(directory, { recursive: true }).some((name) => name.endsWith('.java'))
  );
}

function existingRoots(declared, { basedir, buildDirectory }) {
  const resolved = declared.filter(Boolean).map((root) => path.resolve(basedir, root));
  return [...new Set(resolved)].filter(
    (root) => existsSync(root) && !(buildDirectory && isInside(root, buildDirectory)),
  );
}

function slash(file) {
  return file.split(path.sep).join('/');
}

function describeModule(project, projectRoot) {
  const basedir = locateBasedir(project, projectRoot);
  const dir = slash(path.relative(projectRoot, basedir));
  return {
    ...project,
    basedir,
    dir,
    key: dir === '' ? 'root' : `module-${dir.replaceAll('/', '--')}`,
    path: `:${dir.replaceAll('/', ':')}`,
    sourceRoots: existingRoots(project.declaredSourceRoots, { basedir, ...project }),
    testSourceRoots: existingRoots(project.declaredTestRoots, { basedir, ...project }),
    resourceRoots: project.declaredResourceRoots.map((root) => path.resolve(basedir, root)),
  };
}

function hasJava(module) {
  return [...module.sourceRoots, ...module.testSourceRoots].some(containsJava);
}

export function selectModules(projects, projectRoot) {
  const described = projects.map((project) => describeModule(project, projectRoot));
  const unsupported = described.filter(
    (module) => !SUPPORTED_PACKAGINGS.includes(module.packaging) && hasJava(module),
  );
  if (unsupported.length > 0) {
    const names = unsupported.map(
      (module) => `${module.artifactId} (packaging ${module.packaging})`,
    );
    throw new Error(
      `The java preset cannot analyze Maven modules with Java sources and a packaging other than ${SUPPORTED_PACKAGINGS.join(' or ')}: ${names.join(', ')}`,
    );
  }
  const selected = described.filter(
    (module) => SUPPORTED_PACKAGINGS.includes(module.packaging) && hasJava(module),
  );
  if (selected.length === 0) {
    throw new Error(
      `The java preset found no Maven module with ${SUPPORTED_PACKAGINGS.join(' or ')} packaging and Java sources in ${projectRoot}`,
    );
  }
  return selected;
}

export function readEffectivePom(file) {
  return parseEffectivePom(readFileSync(file, 'utf8'));
}
