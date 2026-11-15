import { listProductionModules, testFileMatcher } from '../../adapters/analysis/python-sources.mjs';
import { collectionOptions } from '../../adapters/configuration/pytest/collection-options.mjs';
import { readPackageFacts } from '../../rules/libraries/package-facts.mjs';
import { readPytestConfig } from '../../adapters/configuration/pytest/pytest-config.mjs';

export function fixOptions(context) {
  const { projectRoot, project } = context;
  const isTest = testFileMatcher(projectRoot);
  const collection = collectionOptions(readPytestConfig(projectRoot));
  const { entryPoints } = readPackageFacts(projectRoot);
  const modules = Object.fromEntries(
    listProductionModules(projectRoot, project.sourceRoots).map(({ file, module }) => [
      file,
      module,
    ]),
  );
  return function optionsFor(files) {
    return {
      sourceRoots: project.sourceRoots,
      testRunner: project.testRunner,
      entryPoints,
      modules,
      ...collection,
      testFiles: files.map(({ path: name }) => name).filter((name) => isTest(name)),
    };
  };
}
