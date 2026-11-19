import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globMatcher } from '../../../../../shared/paths/glob.mjs';
import { findingFactory } from '../../kotlin/review-rules/review-finding.mts';
import { tokenizeJvm } from '../../reuse/source/jvm-tokens.mts';
import { pathInside, sourceFilesUnder, sourceRootsOf } from '../java-sources.mts';
import type { ReviewFinding } from '../../kotlin/review-rules/typed/review-finding-types.mts';
import type { SourceProject } from '../review-types.mts';
import { testBodies, type TestBody } from './test-bodies.mts';

const matcherOf: (glob: string) => { test: (file: string) => boolean } = globMatcher;

export const COPY_PASTED_TEST_RULE = 'CopyPastedTest';
export const COPY_PASTED_TEST_EXCEPTION_RULE = `pmd/${COPY_PASTED_TEST_RULE}`;
export const COPY_PASTED_TEST_MIN_COPIES = 3;
const FORMS = {
  java: 'one parameterized test: `@ParameterizedTest` with `@CsvSource` or `@MethodSource` (TestNG: `@Test(dataProvider = ...)` with a `@DataProvider`), with a row per case',
  kotlin:
    'one parameterized test (`@ParameterizedTest` with `@CsvSource` or `@MethodSource`) or, in Kotest, one `withData` call, with a row per case',
};

export function copyPastedTestMessage({
  count,
  kotlin,
}: {
  count: number;
  kotlin: boolean;
}): string {
  return `This test repeats the body of ${String(count)} others and differs only in its literals. Put the cases in ${kotlin ? FORMS.kotlin : FORMS.java}. A test whose copies differ in a call is not a copy. An exception fits only a group that must stay separate tests, such as copies that need their own annotations.`;
}

function copiesIn(tests: readonly TestBody[]): TestBody[][] {
  const groups = new Map<string, TestBody[]>();
  for (const test of tests) {
    const key = `${String(test.parent)}\0${test.shape}`;
    groups.set(key, [...(groups.get(key) ?? []), test]);
  }
  return [...groups.values()].filter((group) => group.length >= COPY_PASTED_TEST_MIN_COPIES);
}

function sourceFindings(
  file: string,
  text: string,
  finding: ReturnType<typeof findingFactory>,
): ReviewFinding[] {
  const kotlin = file.endsWith('.kt');
  const tokens = tokenizeJvm(text, { kotlin }).filter(({ kind }) => kind !== 'comment');
  return copiesIn(testBodies(tokens, { kotlin })).flatMap((group) =>
    group.slice(COPY_PASTED_TEST_MIN_COPIES - 1).map((test) =>
      finding({
        rule: COPY_PASTED_TEST_RULE,
        file,
        line: test.line,
        symbol: test.name,
        key: test.name,
        message: copyPastedTestMessage({ count: group.length - 1, kotlin }),
      }),
    ),
  );
}

export function readCopyPastedTestFindings(
  projectRoot: string,
  {
    projects,
    kotlin,
    policy = {},
  }: {
    projects: readonly SourceProject[];
    kotlin: boolean;
    policy?: { readonly exclude?: readonly string[] };
  },
): ReviewFinding[] {
  const excluded = (policy.exclude ?? []).map((glob) => matcherOf(glob));
  const extensions = kotlin ? ['.java', '.kt'] : ['.java'];
  const roots = projects.flatMap((project) => sourceRootsOf(project, { kotlin, test: true }));
  const files = [
    ...new Set(
      [...new Set(roots)]
        .flatMap((root) => sourceFilesUnder(pathInside(projectRoot, root), extensions))
        .map((full) => path.relative(projectRoot, full).replaceAll('\\', '/')),
    ),
  ].filter((file) => !excluded.some((matcher) => matcher.test(file)));
  const finding = findingFactory();
  return files.flatMap((file) =>
    sourceFindings(file, readFileSync(pathInside(projectRoot, file), 'utf8'), finding),
  );
}
