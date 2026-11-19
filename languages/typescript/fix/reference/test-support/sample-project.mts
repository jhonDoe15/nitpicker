import { readFileSync } from 'node:fs';
import { containedPath } from '../../../../../core/fix/typed/fix-views.mts';
import { fixWorkingTree, type FixOptions } from '../../../../../core/fix/run-fix.mts';
import {
  fixOptions,
  topicRepository,
  type useGitFixtures,
} from '../../test-support/fix-test-support.mts';

type Sample = { readonly path: string; readonly input: string };

const COMMITTED = {
  'package.json': '{ "name": "demo", "type": "module" }\n',
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'nodenext',
      moduleResolution: 'nodenext',
      target: 'ES2024',
      lib: ['ES2024'],
      types: [],
      noEmit: true,
      noUncheckedIndexedAccess: true,
    },
    include: ['src'],
  }),
};

export function fixedSamples(
  createGitRepository: ReturnType<typeof useGitFixtures>['createGitRepository'],
  samples: readonly Sample[],
  overrides: Partial<FixOptions> = {},
): { readonly toolErrors: readonly unknown[]; readonly texts: readonly string[] } {
  const repository = topicRepository(
    createGitRepository,
    COMMITTED,
    Object.fromEntries(samples.map(({ path: name, input }) => [name, input])),
  );
  const result = fixWorkingTree(fixOptions(repository.root, overrides));
  return {
    toolErrors: result.toolErrors,
    texts: samples.map((sample) =>
      readFileSync(containedPath(repository.root, sample.path), 'utf8'),
    ),
  };
}
