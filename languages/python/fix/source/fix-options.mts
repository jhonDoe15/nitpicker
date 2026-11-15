import type { ToolContext } from '../../adapters/typed/context/tool-context-types.mts';
import type { NamedFile } from '../typed/fix-types.mts';
import type { ScriptOptions } from '../typed/script-types.mts';
import { listProductionModules, testFileMatcher } from '../../adapters/analysis/python-sources.mts';
import { collectionOptions } from '../../adapters/configuration/pytest/collection-options.mts';
import { readPackageFacts } from '../../rules/libraries/package-facts.mts';
import { readPytestConfig } from '../../adapters/configuration/pytest/pytest-config.mts';

export function fixOptions(context: ToolContext): (files: readonly NamedFile[]) => ScriptOptions {
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
  return function optionsFor(files: readonly NamedFile[]): ScriptOptions {
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
