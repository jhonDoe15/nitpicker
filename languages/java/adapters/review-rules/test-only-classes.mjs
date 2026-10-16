import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { outerClass, parseJdeps } from '../metrics/java-coupling.mjs';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { pathInside } from './java-sources.mjs';

const TEST_ONLY_TOOL = 'coupling';
const TEST_ONLY_RULE = 'test-only-export';
const REPORTS = ['jdeps.txt', 'jdeps-classes.txt', 'jdeps-test.txt'];
const ENTRY_POINT = /\bstatic\s+(?:final\s+)?void\s+main\s*\(/u;
const SOURCE_ROOT_LANGUAGE = /\/(?:java|kotlin)$/u;
const SOURCE_EXTENSIONS = ['.java', '.kt'];
const WIRING_ANNOTATIONS = new Set([
  'org.springframework.stereotype.Component',
  'org.springframework.stereotype.Service',
  'org.springframework.stereotype.Repository',
  'org.springframework.stereotype.Controller',
  'org.springframework.web.bind.annotation.RestController',
  'org.springframework.web.bind.annotation.ControllerAdvice',
  'org.springframework.web.bind.annotation.RestControllerAdvice',
  'org.springframework.context.annotation.Configuration',
  'org.springframework.boot.autoconfigure.SpringBootApplication',
  'org.springframework.boot.autoconfigure.AutoConfiguration',
  'org.springframework.boot.context.properties.ConfigurationProperties',
  'jakarta.persistence.Entity',
  'jakarta.persistence.Embeddable',
  'jakarta.persistence.MappedSuperclass',
  'jakarta.persistence.Converter',
  'javax.persistence.Entity',
  'javax.persistence.Embeddable',
  'javax.persistence.MappedSuperclass',
  'jakarta.inject.Named',
  'jakarta.inject.Singleton',
  'javax.inject.Named',
  'javax.inject.Singleton',
  'jakarta.enterprise.context.ApplicationScoped',
  'jakarta.enterprise.context.RequestScoped',
  'jakarta.ws.rs.Path',
  'javax.ws.rs.Path',
]);
const MESSAGE =
  'Class {name} is only used by tests. Move it to the test sources, or use it from production code.';

function readProject(project) {
  function report(name) {
    return readFileSync(pathInside(project.reportRoot, name), 'utf8');
  }
  const manifestFile = pathInside(project.reportRoot, 'manifest.json');
  const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
  return {
    ...project,
    published: manifest.published === true,
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

function addTo(map, key, value) {
  map.set(key, new Set([...(map.get(key) ?? []), value]));
}

function mainUsages(projects, resolve) {
  const production = new Set();
  const wired = new Set();
  const edges = projects.flatMap(({ qualifier, mainEdges }) =>
    mainEdges.map((edge) => ({ ...edge, qualifier })),
  );
  for (const { source, target, qualifier } of edges) {
    const own = `${qualifier}\0${outerClass(source)}`;
    const used = resolve(target, qualifier);
    if (WIRING_ANNOTATIONS.has(target)) {
      wired.add(own);
    }
    if (used !== undefined && used !== own) {
      production.add(used);
    }
  }
  return { production, wired };
}

function testUsages(projects, resolve) {
  const tests = new Map();
  for (const project of projects) {
    const used = project.testEdges.map(({ target }) => resolve(target, project.qualifier));
    for (const key of used.filter((resolved) => resolved !== undefined)) {
      addTo(tests, key, project.qualifier);
    }
  }
  return tests;
}

function usages(projects) {
  const resolve = resolver(ownersOf(projects));
  return { ...mainUsages(projects, resolve), tests: testUsages(projects, resolve) };
}

function filesUnder(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function mainTexts(projectRoot, projects) {
  const roots = projects.flatMap((project) => project.sourceRoots);
  const resources = roots
    .filter((root) => SOURCE_ROOT_LANGUAGE.test(root))
    .map((root) => root.replace(SOURCE_ROOT_LANGUAGE, '/resources'));
  return [...new Set([...roots, ...resources])].flatMap((root) =>
    filesUnder(pathInside(projectRoot, root)).map((file) => ({
      file: path.relative(projectRoot, file).replaceAll('\\', '/'),
      text: readFileSync(file, 'utf8'),
    })),
  );
}

function sourceFileOf(projectRoot, project, className) {
  const relative = className.replaceAll('.', '/');
  return project.sourceRoots
    .flatMap((root) => SOURCE_EXTENSIONS.map((extension) => `${root}/${relative}${extension}`))
    .find((candidate) => existsSync(pathInside(projectRoot, candidate)));
}

function isNamedElsewhere(texts, file, className) {
  const simpleName = className.split('.').at(-1);
  const packageName = className.split('.').slice(0, -1).join('.');
  const simple = new RegExp(String.raw`\b${simpleName}\b`, 'u');
  const sees = new RegExp(
    String.raw`^\s*(?:package\s+${packageName}\s*;?\s*$|import\s+${packageName}\.\*)`,
    'mu',
  );
  return texts.some(
    (entry) =>
      entry.file !== file &&
      (entry.text.includes(className) ||
        (path.basename(entry.file).split('.')[0] !== simpleName &&
          simple.test(entry.text) &&
          sees.test(entry.text))),
  );
}

function declarationLine(text, className) {
  const declaration = new RegExp(
    String.raw`\b(?:class|interface|enum|record|object)\s+${className.split('.').at(-1)}\b`,
    'u',
  ).exec(text);
  return declaration === null ? undefined : text.slice(0, declaration.index).split('\n').length;
}

function finding(file, className, line) {
  return {
    tool: TEST_ONLY_TOOL,
    rule: TEST_ONLY_RULE,
    path: file,
    identity: `class:${className}`,
    symbol: className,
    ...(line === undefined ? {} : { location: { line } }),
    message: `${MESSAGE.replace('{name}', className)} ${exceptionHint(`${TEST_ONLY_TOOL}/${TEST_ONLY_RULE}`, file)}`,
    classification: 'enforceable',
  };
}

function candidate(projectRoot, project, className) {
  const file = sourceFileOf(projectRoot, project, className);
  if (file === undefined) {
    return [];
  }
  const text = readFileSync(pathInside(projectRoot, file), 'utf8');
  return ENTRY_POINT.test(text)
    ? []
    : [{ file, className, line: declarationLine(text, className) }];
}

export function readTestOnlyClassFindings(projectRoot, { projects }) {
  const complete = projects.filter(({ reportRoot }) =>
    REPORTS.every((name) => existsSync(pathInside(reportRoot, name))),
  );
  if (complete.length === 0 || complete.length !== projects.length) {
    return [];
  }
  const read = complete.map(readProject);
  const byQualifier = new Map(read.map((project) => [project.qualifier, project]));
  const { production, wired, tests } = usages(read);
  const candidates = [...tests]
    .filter(([key]) => !production.has(key) && !wired.has(key))
    .map(([key, users]) => ({ key, users, project: byQualifier.get(key.split('\0')[0]) }))
    .filter(({ users, project }) => !(project.published && users.has(project.qualifier)))
    .flatMap(({ key, project }) => candidate(projectRoot, project, key.split('\0')[1]));
  if (candidates.length === 0) {
    return [];
  }
  const texts = mainTexts(projectRoot, read);
  return candidates
    .filter(({ file, className }) => !isNamedElsewhere(texts, file, className))
    .map(({ file, className, line }) => finding(file, className, line))
    .toSorted((left, right) => left.path.localeCompare(right.path));
}
