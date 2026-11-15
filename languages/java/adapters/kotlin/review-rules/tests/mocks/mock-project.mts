import { temporaryRepositories } from '../../../../../../../scripts/test-support/temporary-repositories.mts';
import { productionTypeResolver } from '../../production-types.mjs';
import { run, testFile } from '../../test-support/facts.mts';
import type { FileFacts, RuleFinding } from '../../test-support/facts.mts';
import type { Loose } from '../../test-support/loose-facts.mts';

const resolveProduction: (input: { files: FileFacts[]; projectRoot: string }) => unknown =
  productionTypeResolver;

type MockRule = (files: never, options: never) => unknown;

type MockProject = {
  readonly prefix: string;
  readonly rule: MockRule;
  readonly mainFiles: FileFacts[];
  readonly defaultPath: string;
  readonly extraOptions: (projectFiles: FileFacts[]) => Loose;
};

export function mockProject({
  prefix,
  rule,
  mainFiles,
  defaultPath,
  extraOptions,
}: MockProject): (text: string, testPath?: string, isProduction?: () => boolean) => RuleFinding[] {
  const repository = temporaryRepositories(prefix);

  return function findingsOf(
    text: string,
    testPath = defaultPath,
    isProduction?: () => boolean,
  ): RuleFinding[] {
    const projectRoot = repository({ [testPath]: text });
    const projectFiles = [...mainFiles, testFile({ file: testPath, imports: [] })];
    return run(rule, projectFiles, {
      projectRoot,
      ...extraOptions(projectFiles),
      isProduction: isProduction ?? resolveProduction({ files: projectFiles, projectRoot }),
    });
  };
}
