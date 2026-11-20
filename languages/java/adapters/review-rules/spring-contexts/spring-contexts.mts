import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globMatcher } from '../../../../../shared/paths/glob.mjs';
import { findingFactory } from '../../kotlin/review-rules/finding/review-finding.mts';
import { pathInside, sourceFilesUnder, sourceRootsOf } from '../java-sources.mts';
import type { ReviewFinding } from '../../kotlin/review-rules/typed/review-finding-types.mts';
import type { SourceProject } from '../review-types.mts';
import { testClassOf, type TestClass } from './test-class.mts';

const matcherOf: (glob: string) => { test: (file: string) => boolean } = globMatcher;

export const SPRING_CONTEXT_RULE = 'SpringContextPerMockSet';
export const SPRING_CONTEXT_EXCEPTION_RULE = `pmd/${SPRING_CONTEXT_RULE}`;
const MIN_CONTEXTS = 3;
const BOOT_TEST = /^@SpringBootTest\b/u;
const BOOT_TEST_USE = /@SpringBootTest\b/u;
const EXPLICIT_CLASSES = /^@(?:SpringBootTest\(.*\bclasses=|ContextConfiguration\b)/u;
const LOCAL_CONFIGURATION = /@SpringBoot(?:Application|Configuration)\b/u;
const WORTH_READING = /@SpringBootTest\b|\bextends\b|\babstract\b/u;
const OUTSIDE_CONTEXT = new RegExp(
  [
    '^@(?:Slf4j|Log4j2|CommonsLog|DisplayName|DisplayNameGeneration|Tags?|TestMethodOrder|TestClassOrder',
    '|TestInstance|FixMethodOrder|Order|Timeout|Execution|SuppressWarnings|Deprecated|Transactional|Rollback',
    '|Commit|Sql|SqlGroup|SqlConfig)\\b',
    '|^@RunWith\\(Spring(?:JUnit4Class)?Runner\\.class\\)$',
    '|^@ExtendWith\\((?:\\{?)(?:SpringExtension|MockitoExtension)\\.class(?:\\}?)\\)$',
  ].join(''),
  'u',
);
const REBUILT = /^@(?:DirtiesContext|Disabled|Ignore)\b/u;

type Located = TestClass & { readonly file: string };
type Context = { readonly mocks: string; readonly classes: readonly Located[] };

export function springContextMessage({
  contexts,
  sharing,
  example,
  mocks,
}: {
  contexts: number;
  sharing: number;
  example: string;
  mocks: readonly string[];
}): string {
  const own = mocks.length === 0 ? 'no mock beans' : `the mock beans ${mocks.join(', ')}`;
  return `This test class starts its own application context. Its configuration is the same as that of ${String(sharing)} other test classes of the module (${example} is one) except for its mock beans (${own}), and every distinct set of @MockBean, @MockitoBean, @SpyBean and @MockitoSpyBean fields is a separate entry in Spring's context cache, so these classes start ${String(contexts)} contexts between them. Declare the mocks in a base class or @TestConfiguration that all of them share, or test this class without the whole context: a slice such as @WebMvcTest or a unit test that creates the class with new.`;
}

export const SPRING_CONTEXT_ALLOWED = springContextMessage({
  contexts: 3,
  sharing: 4,
  example: '<TestClass>',
  mocks: ['@MockBean <Type>'],
});

function chainOf(
  first: Located,
  byName: ReadonlyMap<string, Located>,
): readonly Located[] | undefined {
  const chain = [first];
  const seen = new Set([first.name]);
  let current = first;
  while (current.parent !== undefined) {
    const parent = byName.get(current.parent);
    if (parent === undefined || seen.has(parent.name)) {
      return undefined;
    }
    seen.add(parent.name);
    chain.push(parent);
    current = parent;
  }
  return chain;
}

function configurationOf(chain: readonly Located[], localConfiguration: boolean): string {
  const annotations = chain.flatMap(({ annotations: written }) => written);
  const own = chain.filter(({ ownContext }) => ownContext).map(({ name }) => `own:${name}`);
  const searched =
    localConfiguration && !annotations.some((text) => EXPLICIT_CLASSES.test(text))
      ? [`package:${chain[0]?.packageName ?? ''}`]
      : [];
  const written = annotations.filter((text) => !OUTSIDE_CONTEXT.test(text));
  return [...new Set(written), ...own, ...searched].toSorted().join('\n');
}

function contextsOf(classes: readonly Located[], localConfiguration: boolean): Context[][] {
  const byName = new Map(classes.map((found) => [found.name, found]));
  const ambiguous = new Set(
    classes.filter((found) => byName.get(found.name) !== found).map(({ name }) => name),
  );
  const configurations = new Map<string, Map<string, Located[]>>();
  for (const found of classes.filter((item) => !item.abstract && item.tests)) {
    const chain = chainOf(found, byName);
    const annotations = chain?.flatMap(({ annotations: written }) => written) ?? [];
    const usable =
      chain !== undefined &&
      !chain.some(({ name }) => ambiguous.has(name)) &&
      annotations.some((text) => BOOT_TEST.test(text)) &&
      !annotations.some((text) => REBUILT.test(text));
    if (usable) {
      const configuration = configurationOf(chain, localConfiguration);
      const mocks = [...new Set(chain.flatMap((item) => item.mocks))].toSorted().join(', ');
      const contexts = configurations.get(configuration) ?? new Map<string, Located[]>();
      contexts.set(mocks, [...(contexts.get(mocks) ?? []), found]);
      configurations.set(configuration, contexts);
    }
  }
  return [...configurations.values()].map((contexts) =>
    [...contexts].map(([mocks, sharing]) => ({ mocks, classes: sharing })),
  );
}

function fileOf(context: Context): string {
  return context.classes[0]?.file ?? '';
}

function extraContexts(contexts: readonly Context[]): { extra: Context; largest: Context }[] {
  const bySize = contexts.toSorted(
    (left, right) =>
      right.classes.length - left.classes.length || left.mocks.localeCompare(right.mocks),
  );
  const [largest, ...others] = bySize;
  return largest === undefined || contexts.length < MIN_CONTEXTS
    ? []
    : others
        .map((extra) => ({ extra, largest }))
        .toSorted((left, right) => fileOf(left.extra).localeCompare(fileOf(right.extra)));
}

function moduleFindings(
  classes: readonly Located[],
  localConfiguration: boolean,
  finding: ReturnType<typeof findingFactory>,
): ReviewFinding[] {
  return contextsOf(classes, localConfiguration).flatMap((contexts) => {
    const sharing = contexts.reduce((count, context) => count + context.classes.length, 0) - 1;
    return extraContexts(contexts).flatMap(({ extra, largest }) => {
      const [reported] = extra.classes;
      const [example] = largest.classes;
      if (reported === undefined || example === undefined) {
        return [];
      }
      return [
        {
          ...finding({
            rule: SPRING_CONTEXT_RULE,
            file: reported.file,
            line: reported.line,
            symbol: reported.name,
            key: reported.name,
            message: springContextMessage({
              contexts: contexts.length,
              sharing,
              example: example.name,
              mocks: extra.mocks === '' ? [] : extra.mocks.split(', '),
            }),
          }),
          classification: 'descriptive',
        },
      ];
    });
  });
}

function projectFindings(
  projectRoot: string,
  files: readonly string[],
  finding: ReturnType<typeof findingFactory>,
): ReviewFinding[] {
  const texts = files.map((file) => ({
    file,
    text: readFileSync(pathInside(projectRoot, file), 'utf8'),
  }));
  if (!texts.some(({ text }) => BOOT_TEST_USE.test(text))) {
    return [];
  }
  const classes = texts
    .filter(({ text }) => WORTH_READING.test(text))
    .flatMap(({ file, text }): Located[] => {
      const found = testClassOf(text);
      return found === undefined ? [] : [{ ...found, file }];
    });
  const localConfiguration = texts.some(({ text }) => LOCAL_CONFIGURATION.test(text));
  return moduleFindings(classes, localConfiguration, finding);
}

export function readSpringContextFindings(
  projectRoot: string,
  {
    projects,
    policy = {},
  }: {
    projects: readonly SourceProject[];
    kotlin?: boolean;
    policy?: { readonly exclude?: readonly string[] };
  },
): ReviewFinding[] {
  const excluded = (policy.exclude ?? []).map((glob) => matcherOf(glob));
  const finding = findingFactory();
  const seen = new Set<string>();
  return projects.flatMap((project) => {
    const roots = [...new Set(sourceRootsOf(project, { kotlin: false, test: true }))];
    const files = roots
      .flatMap((root) => sourceFilesUnder(pathInside(projectRoot, root), ['.java']))
      .map((full) => path.relative(projectRoot, full).replaceAll('\\', '/'))
      .filter((file) => !seen.has(file) && !excluded.some((matcher) => matcher.test(file)));
    for (const file of files) {
      seen.add(file);
    }
    return projectFindings(projectRoot, files, finding);
  });
}
