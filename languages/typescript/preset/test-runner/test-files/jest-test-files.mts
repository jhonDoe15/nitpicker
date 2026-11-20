import path from 'node:path';
import { fieldOf, fieldsOf, listOf } from '../../../../../shared/values/readers.mts';
import { escapeRegExp } from '../typed/shared-views.mts';
import type { TestFileFacts, TestFileRequest } from '../typed/command-types.mts';
import type { LayoutTestFiles } from '../../layout/layout-types.mts';
import { hasDomEnvironment } from '../../test-environment/environments.mts';
import {
  environmentsFromJestConfig,
  relativeGlob,
  stringList,
} from '../../test-environment/jest/jest-environment.mts';
import { readJestConfig } from '../../test-environment/jest/read-jest-config.mts';
import { defaultTestFiles, mergedTestFiles, testFilePatterns } from './test-file-patterns.mts';

type JestConfig = Readonly<Record<string, unknown>>;
type Anchors = { readonly globs: readonly string[]; readonly regexes: readonly string[] };

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

function posixRelative(projectRoot: string, target: string): string {
  return path.relative(projectRoot, target).split(path.sep).join('/');
}

function runnerPackage(runner: unknown): string | undefined {
  if (typeof runner !== 'string') {
    return 'jest-runner';
  }
  const name = PACKAGE_NAME.exec(runner)?.groups?.['name'];
  return name?.replaceAll('\\', '/');
}

function runsTests(config: JestConfig): boolean {
  return TEST_RUNNER_PACKAGES.has(runnerPackage(config['runner']) ?? '');
}

function relativeRegex(projectRoot: string, rootDir: string, source: string): string {
  const anchored = source.startsWith('^');
  const body = anchored ? source.slice(1) : source;
  if (!body.startsWith(rootDir)) {
    return source;
  }
  const prefix = posixRelative(projectRoot, rootDir);
  return `^${prefix === '' ? '' : `/${prefix}`}${body.slice(rootDir.length)}`;
}

function projectRoots(config: JestConfig, projectRoot: string): string[] {
  const roots = stringList(config['roots']);
  const relative = (roots.length === 0 ? [projectRoot] : roots).map((root) =>
    posixRelative(projectRoot, root),
  );
  return relative.filter((root) => root !== '..' && !root.startsWith('../'));
}

function literalPrefix(glob: string): string {
  const segments = glob.split('/');
  const magic = segments.findIndex((segment) => GLOB_MAGIC.test(segment));
  return segments.slice(0, magic === -1 ? segments.length : magic).join('/');
}

function overlaps(root: string, glob: string): boolean {
  const prefix = literalPrefix(glob);
  return [`${root}/`.startsWith(`${prefix}/`), `${prefix}/`.startsWith(`${root}/`)].some(Boolean);
}

function globsUnder(root: string, glob: string): string[] {
  if (root === '') {
    return [glob];
  }
  if (glob.startsWith(ANY_DEPTH)) {
    return [`${root}/${glob}`];
  }
  return overlaps(root, glob) ? [glob] : [];
}

function regexUnder(root: string, source: string): string {
  return root === '' ? source : `^(?=/${escapeRegExp(root)}/)[\\s\\S]*?(?:${source})`;
}

function anchored(roots: readonly string[], { globs, regexes }: Anchors): Anchors {
  return {
    globs: [...new Set(roots.flatMap((root) => globs.flatMap((glob) => globsUnder(root, glob))))],
    regexes: [
      ...new Set(roots.flatMap((root) => regexes.map((source) => regexUnder(root, source)))),
    ],
  };
}

function jestConfigTestFiles(config: JestConfig, projectRoot: string): LayoutTestFiles {
  const { rootDir: configuredRoot } = config;
  const rootDir = typeof configuredRoot === 'string' ? configuredRoot : projectRoot;
  const globs = stringList(config['testMatch']);
  function glob(pattern: string): string {
    return relativeGlob(projectRoot, rootDir, pattern);
  }
  function regex(source: string): string {
    return relativeRegex(projectRoot, rootDir, source);
  }
  const negated = globs.filter((pattern) => pattern.startsWith('!'));
  const included = anchored(projectRoots(config, projectRoot), {
    globs: globs.filter((pattern) => !pattern.startsWith('!')).map(glob),
    regexes: stringList(config['testRegex']).map(regex),
  });
  return testFilePatterns({
    include: included.globs,
    exclude: negated.map((pattern) => glob(pattern.slice(1))),
    includeRegexes: included.regexes,
    excludeRegexes: stringList(config['testPathIgnorePatterns']).map(regex),
  });
}

function jestFailure(failure: string | undefined): string {
  return `The Jest config could not be read (${String(failure)}), so nitpicker takes Jest's default testMatch as the project's test files.`;
}

export function jestTestFiles({
  projectRoot,
  liveProjectRoot,
  command,
  timeoutMs,
}: TestFileRequest): TestFileFacts {
  const { config, failure } = readJestConfig({ projectRoot, liveProjectRoot, timeoutMs, command });
  if (config === undefined) {
    return {
      testFiles: defaultTestFiles('jest'),
      domEnvironment: false,
      notices: [jestFailure(failure)],
    };
  }
  const configs = listOf(fieldOf(config, 'configs')).map((each) => fieldsOf(each));
  const testing = configs.filter(runsTests).map((each) => jestConfigTestFiles(each, projectRoot));
  return {
    testFiles: configs.length === 0 ? defaultTestFiles('jest') : mergedTestFiles(testing),
    domEnvironment: hasDomEnvironment(environmentsFromJestConfig(config, projectRoot)),
  };
}
