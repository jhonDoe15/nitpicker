import path from 'node:path';
import { escapeRegExp } from '../../../../../shared/paths/glob.mjs';
import { hasDomEnvironment } from '../../test-environment/environments.mjs';
import {
  environmentsFromJestConfig,
  relativeGlob,
  stringList,
} from '../../test-environment/jest/jest-environment.mjs';
import { readJestConfig } from '../../test-environment/jest/read-jest-config.mjs';
import { defaultTestFiles, mergedTestFiles, testFilePatterns } from './test-file-patterns.mjs';

const TEST_RUNNER_PACKAGES = new Set([
  'jest-runner',
  'jest-light-runner',
  'jest-runner-groups',
  '@jest-runner/electron',
  '@kayahr/jest-electron-runner',
]);
const PACKAGE_NAME = /(?:^|[/\\])node_modules[/\\](?<name>(?:@[^/\\]+[/\\])?[^/\\]+)[/\\][^\n]*$/u;
const GLOB_MAGIC = /[!()*?[\]{}]/u;
const ANY_DEPTH = '**/';

function posixRelative(projectRoot, target) {
  return path.relative(projectRoot, target).split(path.sep).join('/');
}

function runnerPackage(runner) {
  if (typeof runner !== 'string') {
    return 'jest-runner';
  }
  const name = PACKAGE_NAME.exec(runner)?.groups.name;
  return name?.replaceAll('\\', '/');
}

function runsTests(config) {
  return TEST_RUNNER_PACKAGES.has(runnerPackage(config.runner) ?? '');
}

function relativeRegex(projectRoot, rootDir, source) {
  const anchored = source.startsWith('^');
  const body = anchored ? source.slice(1) : source;
  if (!body.startsWith(rootDir)) {
    return source;
  }
  const prefix = posixRelative(projectRoot, rootDir);
  return `^${prefix === '' ? '' : `/${prefix}`}${body.slice(rootDir.length)}`;
}

function projectRoots(config, projectRoot) {
  const roots = stringList(config.roots);
  const relative = (roots.length === 0 ? [projectRoot] : roots).map((root) =>
    posixRelative(projectRoot, root),
  );
  return relative.filter((root) => root !== '..' && !root.startsWith('../'));
}

function literalPrefix(glob) {
  const segments = glob.split('/');
  const magic = segments.findIndex((segment) => GLOB_MAGIC.test(segment));
  return segments.slice(0, magic === -1 ? segments.length : magic).join('/');
}

function overlaps(root, glob) {
  const prefix = literalPrefix(glob);
  return [`${root}/`.startsWith(`${prefix}/`), `${prefix}/`.startsWith(`${root}/`)].some(Boolean);
}

function globsUnder(root, glob) {
  if (root === '') {
    return [glob];
  }
  if (glob.startsWith(ANY_DEPTH)) {
    return [`${root}/${glob}`];
  }
  return overlaps(root, glob) ? [glob] : [];
}

function regexUnder(root, source) {
  return root === '' ? source : `^(?=/${escapeRegExp(root)}/)[\\s\\S]*?(?:${source})`;
}

function anchored(roots, { globs, regexes }) {
  return {
    globs: [...new Set(roots.flatMap((root) => globs.flatMap((glob) => globsUnder(root, glob))))],
    regexes: [
      ...new Set(roots.flatMap((root) => regexes.map((source) => regexUnder(root, source)))),
    ],
  };
}

function jestConfigTestFiles(config, projectRoot) {
  const rootDir = typeof config.rootDir === 'string' ? config.rootDir : projectRoot;
  const globs = stringList(config.testMatch);
  function glob(pattern) {
    return relativeGlob(projectRoot, rootDir, pattern);
  }
  function regex(source) {
    return relativeRegex(projectRoot, rootDir, source);
  }
  const negated = globs.filter((pattern) => pattern.startsWith('!'));
  const included = anchored(projectRoots(config, projectRoot), {
    globs: globs.filter((pattern) => !pattern.startsWith('!')).map(glob),
    regexes: stringList(config.testRegex).map(regex),
  });
  return testFilePatterns({
    include: included.globs,
    exclude: negated.map((pattern) => glob(pattern.slice(1))),
    includeRegexes: included.regexes,
    excludeRegexes: stringList(config.testPathIgnorePatterns).map(regex),
  });
}

function jestFailure(failure) {
  return `The Jest config could not be read (${failure}), so nitpicker takes Jest's default testMatch as the project's test files.`;
}

export function jestTestFiles({ projectRoot, liveProjectRoot, command, timeoutMs }) {
  const { config, failure } = readJestConfig({ projectRoot, liveProjectRoot, timeoutMs, command });
  if (config === undefined) {
    return {
      testFiles: defaultTestFiles('jest'),
      domEnvironment: false,
      notices: [jestFailure(failure)],
    };
  }
  const configs = Array.isArray(config.configs) ? config.configs : [];
  const testing = configs.filter(runsTests).map((each) => jestConfigTestFiles(each, projectRoot));
  return {
    testFiles: configs.length === 0 ? defaultTestFiles('jest') : mergedTestFiles(testing),
    domEnvironment: hasDomEnvironment(environmentsFromJestConfig(config, projectRoot)),
  };
}
