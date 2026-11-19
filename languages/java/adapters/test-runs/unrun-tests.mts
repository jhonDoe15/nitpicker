import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionHint as exceptionHintUntyped } from '../../../../shared/rules/exceptions.mjs';
import { inModule } from '../../builds/module-path.mts';
import { projectFilesUnder as projectFilesUnderUntyped } from '../../../../shared/project-files/project-files.mjs';
import { fieldOf, listOf, optionalText, textsOf } from '../../../../shared/values/readers.mts';
import { TEST_DECLARATION } from '../test-runtime/test-markers.mts';
import { isAbstract } from '../test-runtime/test-sources.mts';

const exceptionHint: (rule: string, file: string) => string = exceptionHintUntyped;
const projectFilesUnder: (directory: string) => string[] = projectFilesUnderUntyped;

export type UnrunContext = {
  readonly projectRoot: string;
  readonly modulePath?: string | undefined;
  readonly reportRoot: string;
  readonly manifest: unknown;
};
type TestClass = {
  readonly file: string;
  readonly text: string;
  readonly simple: string;
  readonly modulePath: string | undefined;
  readonly className: string;
};
type UnrunFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
  readonly symbol: string;
};

const TOOL = 'test-runtime';
const UNRUN_TEST_RULE = 'test-not-run';
export const UNRUN_TEST_EXCEPTION_RULE = `${TOOL}/${UNRUN_TEST_RULE}`;

export const UNRUN_TEST_ADVICE = {
  maven: ({ test }: { test: string }): string =>
    `Bind the integration-test and verify goals of maven-failsafe-plugin in this module so ${test} runs: Surefire skips classes named IT*, *IT and *ITCase, and Failsafe does not run here, so its tests never run.`,
  gradle: ({ sourceSet, test }: { sourceSet: string; test: string }): string =>
    `Register a Test task for the ${sourceSet} source set (testClassesDirs = sourceSets.${sourceSet}.output.classesDirs, classpath = sourceSets.${sourceSet}.runtimeClasspath) so ${test} runs: no test task runs that source set, so its tests never run.`,
};
const TEST_RESULTS = 'test-results';
const SOURCE_FILE = /\.(?:java|kt|groovy)$/u;
const FAILSAFE_NAME = /^IT|IT$|ITCase$/u;
const KOTEST_SPECS = 'Fun|String|Should|Describe|Behavior|Word|Free|Feature|Expect|Annotation';
const KOTEST_SPEC = String.raw`:\s*(?:${KOTEST_SPECS})Spec\b`;
export const DECLARES_KOTEST_SPEC = new RegExp(KOTEST_SPEC, 'u');
const PACKAGE = /^\s*package\s+([\w.]+)/mu;
const JAVA_TEST_ROOT = /(^|\/)src\/test\/java$/u;

function filesUnder(base: string, root: string): string[] {
  const directory = path.resolve(base, root);
  if (!directory.startsWith(base + path.sep)) {
    return [];
  }
  return projectFilesUnder(directory)
    .filter((file) => SOURCE_FILE.test(path.basename(file)))
    .sort();
}

function testClasses(
  { projectRoot, modulePath }: UnrunContext,
  roots: readonly string[],
): TestClass[] {
  const base = path.resolve(projectRoot);
  return [...new Set(roots)]
    .flatMap((root) => filesUnder(base, root))
    .map((absolute) => {
      const text = readFileSync(absolute, 'utf8');
      const simple = path.basename(absolute).replace(SOURCE_FILE, '');
      const owner = PACKAGE.exec(text)?.[1];
      return {
        file: path.relative(base, absolute).replaceAll('\\', '/'),
        text,
        simple,
        modulePath,
        className: owner === undefined ? simple : `${owner}.${simple}`,
      };
    })
    .filter(({ text, simple }) => TEST_DECLARATION.test(text) && !isAbstract(text, simple));
}

function ranClasses(reportRoot: string): Set<string> {
  const results = path.join(reportRoot, TEST_RESULTS);
  return new Set(
    existsSync(results)
      ? readdirSync(results, { recursive: true, encoding: 'utf8' })
          .map((entry) => path.basename(entry))
          .filter((name) => /^TEST-.+\.xml$/u.test(name))
          .map((name) => name.slice('TEST-'.length, -'.xml'.length))
      : [],
  );
}

function finding({ file, simple, modulePath }: TestClass, message: string): UnrunFinding {
  return {
    tool: TOOL,
    rule: UNRUN_TEST_RULE,
    path: file,
    identity: simple,
    message: `${message} ${exceptionHint(UNRUN_TEST_EXCEPTION_RULE, inModule(modulePath, file))}`,
    classification: 'enforceable',
    symbol: simple,
  };
}

function mavenTestRoots(manifest: unknown): string[] {
  const roots = [
    ...textsOf(fieldOf(manifest, 'testSourceRoots')),
    ...textsOf(fieldOf(manifest, 'kotlinTestSourceRoots')),
  ];
  return [
    ...roots,
    ...roots
      .filter((root) => JAVA_TEST_ROOT.test(root))
      .map((root) => root.replace(JAVA_TEST_ROOT, '$1src/test/kotlin')),
  ];
}

function mavenFindings(context: UnrunContext): UnrunFinding[] {
  const { reportRoot, manifest } = context;
  if (fieldOf(manifest, 'runsFailsafe') !== false || fieldOf(manifest, 'testsFailed') === true) {
    return [];
  }
  const ran = ranClasses(reportRoot);
  return testClasses(context, mavenTestRoots(manifest))
    .filter(({ simple, className }) => FAILSAFE_NAME.test(simple) && !ran.has(className))
    .map((test) => finding(test, UNRUN_TEST_ADVICE.maven({ test: test.simple })));
}

function gradleFindings(context: UnrunContext): UnrunFinding[] {
  const sets = fieldOf(context.manifest, 'unrunTestSourceSets');
  return listOf(sets).flatMap((set) =>
    testClasses(context, textsOf(fieldOf(set, 'roots'))).map((test) =>
      finding(
        test,
        UNRUN_TEST_ADVICE.gradle({
          sourceSet: optionalText(fieldOf(set, 'name')) ?? '',
          test: test.simple,
        }),
      ),
    ),
  );
}

export function readUnrunTestFindings(context: UnrunContext): UnrunFinding[] {
  return fieldOf(context.manifest, 'build') === 'maven'
    ? mavenFindings(context)
    : gradleFindings(context);
}
