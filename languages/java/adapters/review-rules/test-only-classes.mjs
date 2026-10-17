import { existsSync, readFileSync } from 'node:fs';
import { outerClass, parseJdeps } from '../metrics/java-coupling.mjs';
import { exceptionText } from '../../../../shared/rules/exceptions.mjs';
import { pathInside } from './java-sources.mjs';
import { isNamedElsewhere, readProjectTexts } from './project-texts.mjs';
import { readDeclarations } from './source-declarations.mjs';
import { mainUsages } from './test-only-usage.mjs';

const TEST_ONLY_TOOL = 'coupling';
const TEST_ONLY_RULE = 'test-only-export';
export const TEST_ONLY_EXCEPTION_RULE = `${TEST_ONLY_TOOL}/${TEST_ONLY_RULE}`;
const REPORTS = ['jdeps.txt', 'jdeps-classes.txt', 'jdeps-test.txt'];
const MESSAGE =
  'Class {name} is only used by tests. Move it to the test sources, or use it from production code. ' +
  'If it is loaded by name from a file nitpicker does not read, or another build uses it, add {exception} to "exceptions" in nitpicker.config.json.';

function readProject(project) {
  function report(name) {
    return readFileSync(pathInside(project.reportRoot, name), 'utf8');
  }
  const manifestFile = pathInside(project.reportRoot, 'manifest.json');
  const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
  return {
    ...project,
    kotlinSourceRoots: project.kotlinSourceRoots ?? [],
    resourceRoots: project.resourceRoots ?? [],
    publishes: manifest.published === true,
    classes: report('jdeps-classes.txt').split(/\r?\n/u).filter(Boolean),
    mainEdges: parseJdeps(report('jdeps.txt')),
    testEdges: parseJdeps(report('jdeps-test.txt')),
  };
}

function ownersOf(projects) {
  const owners = new Map();
  for (const project of projects) {
    for (const name of new Set(project.classes.map(outerClass))) {
      owners.set(name, [...(owners.get(name) ?? []), project.qualifier]);
    }
  }
  return owners;
}

function resolver(owners) {
  return (target, qualifier) => {
    const found = owners.get(outerClass(target)) ?? [];
    if (found.includes(qualifier)) {
      return `${qualifier}\0${outerClass(target)}`;
    }
    return found.length === 1 ? `${found[0]}\0${outerClass(target)}` : undefined;
  };
}

function testUsages(projects, resolve) {
  return new Set(
    projects
      .flatMap((project) =>
        project.testEdges.map(({ target }) => resolve(target, project.qualifier)),
      )
      .filter((resolved) => resolved !== undefined),
  );
}

function withDeclarations(projectRoot, project) {
  const declarations = readDeclarations(projectRoot, [
    ...project.sourceRoots,
    ...project.kotlinSourceRoots,
  ]);
  return {
    ...project,
    declarations,
    hasEntryPoint: [...declarations.values()].some(({ entryPoint }) => entryPoint),
  };
}

function finding({ file, className, line }) {
  const exception = exceptionText(TEST_ONLY_EXCEPTION_RULE, file);
  return {
    tool: TEST_ONLY_TOOL,
    rule: TEST_ONLY_RULE,
    path: file,
    identity: `class:${className}`,
    symbol: className,
    location: { line },
    message: MESSAGE.replace('{name}', className).replace('{exception}', exception),
    classification: 'enforceable',
  };
}

function candidates(projectRoot, read) {
  const resolve = resolver(ownersOf(read));
  const { production, wired, applications } = mainUsages(read, resolve);
  const keys = [...testUsages(read, resolve)].filter(
    (key) => !production.has(key) && !wired.has(key),
  );
  const involved = new Set(keys.map((key) => key.split('\0')[0]));
  const byQualifier = new Map(
    read
      .filter((project) => involved.has(project.qualifier))
      .map((project) => [project.qualifier, withDeclarations(projectRoot, project)]),
  );
  function isLibrary(project) {
    return project.publishes && !project.hasEntryPoint && !applications.has(project.qualifier);
  }
  return keys
    .map((key) => ({ project: byQualifier.get(key.split('\0')[0]), className: key.split('\0')[1] }))
    .filter(({ project }) => !isLibrary(project))
    .flatMap(({ project, className }) => {
      const declared = project.declarations.get(className);
      return declared === undefined || declared.entryPoint
        ? []
        : [{ file: declared.file, className, line: declared.line }];
    });
}

export function readTestOnlyClassFindings(projectRoot, { projects }) {
  const complete = projects.filter(({ reportRoot }) =>
    REPORTS.every((name) => existsSync(pathInside(reportRoot, name))),
  );
  if (complete.length === 0 || complete.length !== projects.length) {
    return [];
  }
  const read = complete.map(readProject);
  const found = candidates(projectRoot, read);
  if (found.length === 0) {
    return [];
  }
  const texts = readProjectTexts(projectRoot, read);
  return found
    .filter((candidate) => !isNamedElsewhere(texts, candidate))
    .map(finding)
    .toSorted(
      (left, right) =>
        left.path.localeCompare(right.path) || left.location.line - right.location.line,
    );
}
