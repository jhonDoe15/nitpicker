import path from 'node:path';
import { relativeGlob, stringList } from '../../test-environment/jest/jest-environment.mjs';
import { readJestConfig } from '../../test-environment/jest/read-jest-config.mjs';
import { defaultTestFiles, mergedTestFiles, testFilePatterns } from './test-file-patterns.mjs';

function relativeRegex(projectRoot, rootDir, source) {
  if (!source.startsWith(rootDir)) {
    return source;
  }
  const prefix = path.relative(projectRoot, rootDir).split(path.sep).join('/');
  return `${prefix === '' ? '' : `/${prefix}`}${source.slice(rootDir.length)}`;
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
  return testFilePatterns({
    include: globs.filter((pattern) => !pattern.startsWith('!')).map(glob),
    exclude: globs
      .filter((pattern) => pattern.startsWith('!'))
      .map((pattern) => glob(pattern.slice(1))),
    includeRegexes: stringList(config.testRegex).map(regex),
    excludeRegexes: stringList(config.testPathIgnorePatterns).map(regex),
  });
}

export function jestTestFiles({ projectRoot, command, timeoutMs }) {
  const { config } = readJestConfig({ projectRoot, timeoutMs, command });
  const configs = Array.isArray(config?.configs) ? config.configs : [];
  return configs.length === 0
    ? defaultTestFiles('jest')
    : mergedTestFiles(configs.map((each) => jestConfigTestFiles(each, projectRoot)));
}
