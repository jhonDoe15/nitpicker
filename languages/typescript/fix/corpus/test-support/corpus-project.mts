import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fixWorkingTree } from '../../../../../core/fix/run-fix.mts';
import {
  fixOptions,
  topicRepository,
  type useGitFixtures,
} from '../../test-support/fix-test-support.mts';

type Texts = Readonly<Record<string, string>>;

export type CorpusRun = {
  readonly projectRoot: string;
  readonly before: Texts;
  readonly after: Texts;
  readonly notes: readonly string[];
  readonly toolErrors: readonly unknown[];
};

const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures');
const MODULES = path.join(FIXTURES, 'modules');
const FOLDER = 'src/main/corpus';
const SUFFIX = '.ts.txt';

const COMMITTED = {
  'package.json': '{ "name": "corpus", "type": "module" }\n',
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
      exactOptionalPropertyTypes: true,
    },
    include: ['src'],
  }),
};

export function corpusModules(): Texts {
  return Object.fromEntries(
    readdirSync(MODULES)
      .filter((name) => name.endsWith(SUFFIX))
      .toSorted()
      .map((name) => [
        `${FOLDER}/${name.slice(0, -'.txt'.length)}`,
        readFileSync(path.join(MODULES, name), 'utf8'),
      ]),
  );
}

export function expectedText(run: string, name: string): string | undefined {
  const file = path.join(FIXTURES, 'expected', run, `${path.basename(name)}.txt`);
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

export function fixedCorpus(
  createGitRepository: ReturnType<typeof useGitFixtures>['createGitRepository'],
  selectedRules: readonly string[] | undefined,
): CorpusRun {
  const before = corpusModules();
  const repository = topicRepository(createGitRepository, COMMITTED, before);
  const result = fixWorkingTree(
    fixOptions(repository.root, selectedRules === undefined ? {} : { selectedRules }),
  );
  const after = Object.fromEntries(
    Object.keys(before).map((name) => [
      name,
      readFileSync(path.join(repository.root, name), 'utf8'),
    ]),
  );
  return {
    projectRoot: repository.root,
    before,
    after,
    notes: result.notes ?? [],
    toolErrors: result.toolErrors,
  };
}
