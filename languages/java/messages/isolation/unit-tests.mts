import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  blankLiterals,
  pathInside,
  readJavaSource,
} from '../../adapters/review-rules/java-sources.mts';
import {
  isIntegrationTest as untypedIsIntegrationTest,
  isSpringBootTest as untypedIsSpringBootTest,
} from '../../adapters/test-times/integration-tests.mts';

type Locate = (directory: string, fileName: string) => string | undefined;
type IsolationFinding = { readonly tool: string; readonly rule: string; readonly path: string };

const isIntegrationTest: (input: { className: string; unitSource: boolean }) => boolean =
  untypedIsIntegrationTest;
const isSpringBootTest: (
  text: string,
  context: { locate: Locate; projectRoot: string },
) => boolean = untypedIsSpringBootTest;

export const NETWORK_RULE = 'NetworkInTest';
const PACKAGE = /^\s*package\s+([\w.]+)/mu;
const DECLARED_CLASS = /\bclass\s+([A-Z]\w*)/gu;
const SOURCE_SET = /(?:^|[\\/])src[\\/]([^\\/]+)[\\/]/u;
const TEST_SOURCE_SET = /^test$|Test$/u;
const INTEGRATION_SOURCE_SET =
  /^(?:integration|intTest|it|e2e|functional|acceptance|system|smoke)/iu;

function classNamesOf(file: string, text: string): string[] {
  const owner = PACKAGE.exec(text)?.[1];
  const simple = path.posix.basename(file).replace(/\.(?:java|kt)$/u, '');
  const declared = [...blankLiterals(text).matchAll(DECLARED_CLASS)].map((match) => match[1] ?? '');
  return [...new Set([simple, ...declared])].map((name) =>
    [owner, name].filter((part) => part !== undefined && part !== '').join('.'),
  );
}

function isUnitSource(file: string): boolean {
  const set = SOURCE_SET.exec(file)?.[1];
  return set === undefined || (TEST_SOURCE_SET.test(set) && !INTEGRATION_SOURCE_SET.test(set));
}

function isIntegrationTestFile({
  file,
  text,
  projectRoot,
  locate,
}: {
  file: string;
  text: string;
  projectRoot: string;
  locate: Locate;
}): boolean {
  const unitSource = isUnitSource(file);
  return (
    classNamesOf(file, text).some((className) => isIntegrationTest({ className, unitSource })) ||
    isSpringBootTest(text, { locate, projectRoot })
  );
}

function sourceLocator(projectRoot: string, roots: readonly string[]): Locate {
  return (directory, fileName) =>
    roots
      .map((root) => [root, directory, fileName].filter(Boolean).join('/'))
      .find((candidate) => existsSync(pathInside(projectRoot, candidate)));
}

export function integrationTestFiles(
  projectRoot: string,
  testRoots: readonly string[],
): (file: string) => boolean {
  const locate = sourceLocator(projectRoot, testRoots);
  const known = new Map<string, boolean>();
  return (file) => {
    if (!known.has(file)) {
      const outside = path.isAbsolute(file) || file.split(/[\\/]/u).includes('..');
      const text = outside ? undefined : readJavaSource(pathInside(projectRoot, file));
      known.set(
        file,
        text !== undefined && isIntegrationTestFile({ file, text, projectRoot, locate }),
      );
    }
    return known.get(file) === true;
  };
}

export function dropNetworkInIntegrationTests<Finding extends IsolationFinding>(
  findings: Finding[],
  {
    projectRoot,
    testRoots = [],
  }: { projectRoot: string | undefined; testRoots?: readonly string[] },
): Finding[] {
  if (projectRoot === undefined || !findings.some((finding) => finding.rule === NETWORK_RULE)) {
    return findings;
  }
  const isIntegration = integrationTestFiles(projectRoot, testRoots);
  return findings.filter(
    (finding) =>
      finding.tool !== 'pmd' || finding.rule !== NETWORK_RULE || !isIntegration(finding.path),
  );
}
