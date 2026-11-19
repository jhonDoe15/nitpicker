import path from 'node:path';
import { blankLiterals as untypedBlankLiterals } from '../../../../adapters/review-rules/java-sources.mts';
import { springWiringProblems as untypedSpringWiringProblems } from '../../../../adapters/spring/wiring/spring-wiring.mts';
import { projectFilesUnder as untypedProjectFilesUnder } from '../../../../../../shared/project-files/project-files.mjs';
import { callUntyped } from '../../../../adapters/typed/java-values.mts';
import { fieldOf, listOf, textsOf } from '../../../../../../shared/values/readers.mts';
import type { FixRecipe, RecipeFix } from '../../../../../../core/fix/typed/fix-types.mts';
import { enableInsertions, featureOf } from './enable-edits.mts';
import type { Feature } from './enable-edits.mts';

type Problem = { readonly key: string; readonly path: string; readonly line: number };
type ModulePlan = { readonly fixes: RecipeFix[]; readonly notes: string[] };
type Application = { readonly path: string; readonly text: string; readonly at: number };
type Reader = (name: string) => string | undefined;
type ModuleInput = {
  readonly projectRoot: string;
  readonly read: Reader;
  readonly accepts: (name: string) => boolean;
};

const blankLiterals: (text: string) => string = untypedBlankLiterals;

function isProblem(value: unknown): value is Problem {
  return (
    typeof fieldOf(value, 'key') === 'string' &&
    typeof fieldOf(value, 'path') === 'string' &&
    typeof fieldOf(value, 'line') === 'number'
  );
}

function springWiringProblems(
  projectRoot: string,
  sourceRoots: readonly string[],
  resourceRoots: readonly string[],
): Problem[] {
  const found = callUntyped(untypedSpringWiringProblems, projectRoot, sourceRoots, resourceRoots);
  return listOf(found).filter(isProblem);
}

const SOURCE_FILE = /\.(?:java|kt)$/;
const MAIN_SOURCE = /^(.*?)src\/main\/(?:java|kotlin)\//;
const BOOT_APPLICATION = /@\s*(?:\w+\s*\.\s*)*SpringBootApplication\b/g;
const SECURED = 'org.springframework.security.access.annotation.Secured';
const RESILIENCE = 'org.springframework.resilience.';

function projectFilesUnder(root: string): string[] {
  return textsOf(callUntyped(untypedProjectFilesUnder, root));
}

function applicationClasses(projectRoot: string, prefix: string, read: Reader): Application[] {
  return ['java', 'kotlin']
    .flatMap((kind) => projectFilesUnder(path.join(projectRoot, `${prefix}src/main/${kind}`)))
    .filter((file) => SOURCE_FILE.test(file))
    .map((file) => path.relative(projectRoot, file).split(path.sep).join('/'))
    .flatMap((name) => {
      const text = read(name);
      const [first] = text === undefined ? [] : [...blankLiterals(text).matchAll(BOOT_APPLICATION)];
      return text === undefined || first === undefined
        ? []
        : [{ path: name, text, at: first.index }];
    });
}

function featureFor(key: string, users: readonly string[]): Feature | undefined {
  const feature = featureOf(key);
  if (
    feature === undefined ||
    (key === 'enable-retry' && users.some((t) => t.includes(RESILIENCE)))
  ) {
    return undefined;
  }
  const secured = key === 'enable-methodsecurity' && users.some((text) => text.includes(SECURED));
  return secured ? { ...feature, args: '(securedEnabled = true)' } : feature;
}

function usersOf(problems: readonly Problem[], key: string, read: Reader): string[] {
  return problems
    .filter((problem) => problem.key === key)
    .map(({ path: name }) => read(name) ?? '');
}

function moduleFix({
  problems,
  application,
  read,
  accepts,
}: ModuleInput & {
  readonly problems: readonly Problem[];
  readonly application: Application;
}): RecipeFix | undefined {
  const keys = [...new Set(problems.map(({ key }) => key))];
  const features = keys
    .map((key) => featureFor(key, usersOf(problems, key, read)))
    .filter((feature) => feature !== undefined);
  const first = problems[0];
  if (first === undefined || features.length === 0 || !accepts(application.path)) {
    return undefined;
  }
  const semicolon = application.path.endsWith('.kt') ? '' : ';';
  return {
    finding: { tool: 'spring', rule: 'missing-enable', path: first.path, line: first.line },
    edits: enableInsertions({
      text: application.text,
      annotationAt: application.at,
      features,
      semicolon,
    }).map(({ offset, text }) => ({
      type: 'replace',
      path: application.path,
      start: offset,
      end: offset,
      text,
    })),
  };
}

function planModule(prefix: string, changed: ReadonlySet<string>, input: ModuleInput): ModulePlan {
  const { projectRoot, read, accepts } = input;
  const problems = springWiringProblems(
    projectRoot,
    [`${prefix}src/main/java`, `${prefix}src/main/kotlin`],
    [`${prefix}src/main/resources`],
  ).filter(({ path: name }) => changed.has(name));
  if (problems.length === 0) {
    return { fixes: [], notes: [] };
  }
  const applications = applicationClasses(projectRoot, prefix, read);
  const [application] = applications;
  if (application === undefined || applications.length !== 1) {
    return {
      fixes: [],
      notes: [
        `spring/missing-enable in ${prefix === '' ? '.' : prefix}: left as is, ${applications.length === 0 ? 'no' : 'more than one'} @SpringBootApplication class found`,
      ],
    };
  }
  const fix = moduleFix({ problems, application, read, accepts, projectRoot });
  return { fixes: fix === undefined ? [] : [fix], notes: [] };
}

export const missingEnableRecipe: FixRecipe = {
  id: 'spring-missing-enable',
  rules: [{ tool: 'spring', rule: 'missing-enable' }],
  presets: ['java', 'kotlin'],
  scope: 'project',
  safety: 'review',
  plan({ files, read, projectRoot, accepts }) {
    if (read === undefined || projectRoot === undefined || accepts === undefined) {
      return { fixes: [], notes: [] };
    }
    const changed = new Set(files.map(({ path: name }) => name));
    const prefixes = [
      ...new Set([...changed].flatMap((name) => MAIN_SOURCE.exec(name)?.slice(1, 2) ?? [])),
    ];
    const planned = prefixes.map((prefix) =>
      planModule(prefix, changed, { projectRoot, read, accepts }),
    );
    return {
      fixes: planned.flatMap(({ fixes }) => fixes),
      notes: planned.flatMap(({ notes }) => notes),
    };
  },
};
