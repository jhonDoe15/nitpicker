import { testFileMatcher } from '../../adapters/analysis/python-sources.mjs';
import { collectionOptions } from '../../adapters/configuration/pytest/collection-options.mjs';
import { readPytestConfig } from '../../adapters/configuration/pytest/pytest-config.mjs';

export function fixOptions(context) {
  const { projectRoot, project } = context;
  const isTest = testFileMatcher(projectRoot);
  const collection = collectionOptions(readPytestConfig(projectRoot));
  return function optionsFor(files) {
    return {
      sourceRoots: project.sourceRoots,
      testRunner: project.testRunner,
      ...collection,
      testFiles: files.map(({ path: name }) => name).filter((name) => isTest(name)),
    };
  };
}
