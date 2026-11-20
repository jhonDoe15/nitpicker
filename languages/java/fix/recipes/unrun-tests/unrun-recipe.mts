import type { FixRecipe, RecipeFix } from '../../../../../core/fix/typed/fix-types.mts';
import { TEST_DECLARATION } from '../../../adapters/test-runtime/test-markers.mts';
import { isAbstract } from '../../../adapters/test-runtime/test-sources.mts';
import { exceptedOf, GENERATED } from '../logic/tree-fix-recipe.mts';
import { projectTexts } from '../source/project-sources.mts';
import { gradleFix, type GradleGroup, type Planned, type TestClassFile } from './gradle-task.mts';
import { COLLECTED_NAME, FAILSAFE_NAME, mavenRename } from './maven-rename.mts';

type Module = { readonly prefix: string; readonly set: string };
type Reader = (name: string) => string | undefined;

const RULE = 'test-runtime/test-not-run';
const TEST_FILE = /^(?<prefix>(?:.*\/)?)src\/(?<set>[^/]+)\/(?:java|kotlin|groovy)\/.+\.java$/u;
const GRADLE_FILES = ['build.gradle.kts', 'build.gradle'];

function moduleOf(name: string): Module | undefined {
  const groups = TEST_FILE.exec(name)?.groups;
  return groups === undefined
    ? undefined
    : { prefix: groups['prefix'] ?? '', set: groups['set'] ?? '' };
}

function prefixOf(name: string): string {
  return moduleOf(name)?.prefix ?? '';
}

function simpleOf(name: string): string {
  return name.slice(name.lastIndexOf('/') + 1).replace(/\.java$/u, '');
}

function isTestClass({ path, text }: TestClassFile): boolean {
  return TEST_DECLARATION.test(text) && !isAbstract(text, simpleOf(path));
}

function noteOf(file: string, declined: string): string {
  return `${RULE} in ${file}:1: left as is, ${declined}`;
}

function gradleGroups(
  classes: readonly TestClassFile[],
  read: Reader,
  scripts: readonly { readonly path: string; readonly text: string }[],
): GradleGroup[] {
  const grouped = Map.groupBy(
    classes.filter(({ path }) => !['main', 'test'].includes(moduleOf(path)?.set ?? 'main')),
    ({ path }) => `${prefixOf(path)}\0${moduleOf(path)?.set ?? ''}`,
  );
  return [...grouped.values()].flatMap((group) => {
    const [first] = group;
    const found = first === undefined ? undefined : moduleOf(first.path);
    const buildFile = GRADLE_FILES.map((name) => `${found?.prefix ?? ''}${name}`).find(
      (name) => read(name) !== undefined,
    );
    const buildText = buildFile === undefined ? undefined : read(buildFile);
    return found === undefined || buildFile === undefined || buildText === undefined
      ? []
      : [
          {
            buildFile,
            buildText,
            set: found.set,
            classes: group,
            scripts: scripts.filter(({ path }) => path !== buildFile).map(({ text }) => text),
          },
        ];
  });
}

export const unrunTestsRecipe: FixRecipe = {
  id: 'java-unrun-tests',
  rules: [{ tool: 'test-runtime', rule: 'test-not-run' }],
  presets: ['java'],
  scope: 'project',
  safety: 'review',
  plan({ files, read, projectRoot, inputs }) {
    if (read === undefined || projectRoot === undefined) {
      return { fixes: [] };
    }
    const isExcepted = exceptedOf(inputs);
    const classes = files
      .filter(
        ({ path }) =>
          moduleOf(path) !== undefined && !GENERATED.test(path) && !isExcepted(RULE, path),
      )
      .filter(isTestClass);
    const maven = classes.filter(
      ({ path }) =>
        moduleOf(path)?.set === 'test' &&
        FAILSAFE_NAME.test(simpleOf(path)) &&
        !COLLECTED_NAME.test(simpleOf(path)) &&
        read(`${prefixOf(path)}pom.xml`) !== undefined &&
        !GRADLE_FILES.some((name) => read(`${prefixOf(path)}${name}`) !== undefined),
    );
    const texts = classes.length === 0 ? [] : projectTexts(projectRoot, read);
    const failsafeBuilt = texts.some(
      ({ path, text }) => /(?:^|\/)pom\.xml$/u.test(path) && /failsafe|surefire/u.test(text),
    );
    const scripts = texts.filter(({ path }) => /\.(?:gradle|kts)$/u.test(path));
    const planned: { readonly file: string; readonly result: Planned }[] = [
      ...maven.map((file) => ({
        file: file.path,
        result: mavenRename({
          file,
          texts,
          failsafeBuilt,
        }),
      })),
      ...gradleGroups(classes, read, scripts).map((group) => ({
        file: group.classes[0]?.path ?? group.buildFile,
        result: gradleFix(group),
      })),
    ];
    const fixes: RecipeFix[] = planned.flatMap(({ result }) =>
      'fix' in result ? [result.fix] : [],
    );
    const notes = planned.flatMap(({ file, result }) =>
      'declined' in result && result.declined !== '' ? [noteOf(file, result.declined)] : [],
    );
    return { fixes, notes };
  },
};
