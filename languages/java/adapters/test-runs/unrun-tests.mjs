import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { inModule } from '../../builds/module-path.mjs';

const TOOL = 'test-runtime';
const UNRUN_TEST_RULE = 'test-not-run';
export const UNRUN_TEST_EXCEPTION_RULE = `${TOOL}/${UNRUN_TEST_RULE}`;
const TEST_RESULTS = 'test-results';
const SOURCE_FILE = /\.(?:java|kt|groovy)$/u;
const FAILSAFE_NAME = /^IT|IT$|ITCase$/u;
const KOTEST_SPECS = 'Fun|String|Should|Describe|Behavior|Word|Free|Feature|Expect|Annotation';
const KOTEST_SPEC = String.raw`:\s*(?:${KOTEST_SPECS})Spec\b`;
export const DECLARES_KOTEST_SPEC = new RegExp(KOTEST_SPEC, 'u');
const DECLARES_TESTS = new RegExp(
  String.raw`@(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b|\bextends\s+Specification\b|${KOTEST_SPEC}`,
  'u',
);
const PACKAGE = /^\s*package\s+([\w.]+)/mu;
const JAVA_TEST_ROOT = /(^|\/)src\/test\/java$/u;

function filesUnder(base, root) {
  const directory = path.resolve(base, root);
  if (!directory.startsWith(base + path.sep)) {
    return [];
  }
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && SOURCE_FILE.test(entry.name))
    .map((entry) => path.resolve(entry.parentPath, entry.name))
    .sort();
}

function testClasses({ projectRoot, modulePath }, roots) {
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
    .filter(({ text, simple }) => DECLARES_TESTS.test(text) && !isAbstract(text, simple));
}

function isAbstract(text, simple) {
  return new RegExp(
    String.raw`\b(?:abstract\s+(?:\w+\s+)*class|interface|@interface)\s+${simple}\b`,
    'u',
  ).test(text);
}

function ranClasses(reportRoot) {
  const results = path.join(reportRoot, TEST_RESULTS);
  return new Set(
    existsSync(results)
      ? readdirSync(results, { recursive: true })
          .map((entry) => path.basename(String(entry)))
          .filter((name) => /^TEST-.+\.xml$/u.test(name))
          .map((name) => name.slice('TEST-'.length, -'.xml'.length))
      : [],
  );
}

function finding({ file, simple, modulePath }, message) {
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

function mavenTestRoots(manifest) {
  const roots = [...(manifest.testSourceRoots ?? []), ...(manifest.kotlinTestSourceRoots ?? [])];
  return [
    ...roots,
    ...roots
      .filter((root) => JAVA_TEST_ROOT.test(root))
      .map((root) => root.replace(JAVA_TEST_ROOT, '$1src/test/kotlin')),
  ];
}

function mavenFindings(context) {
  const { reportRoot, manifest } = context;
  if (manifest.runsFailsafe !== false) {
    return [];
  }
  const ran = ranClasses(reportRoot);
  return testClasses(context, mavenTestRoots(manifest))
    .filter(({ simple, className }) => FAILSAFE_NAME.test(simple) && !ran.has(className))
    .map((test) =>
      finding(
        test,
        `Bind the integration-test and verify goals of maven-failsafe-plugin in this module so ${test.simple} runs: Surefire skips classes named IT*, *IT and *ITCase, and Failsafe does not run here, so its tests never run.`,
      ),
    );
}

function gradleFindings(context) {
  return (context.manifest.unrunTestSourceSets ?? []).flatMap(({ name, roots }) =>
    testClasses(context, roots).map((test) =>
      finding(
        test,
        `Register a Test task for the ${name} source set (testClassesDirs = sourceSets.${name}.output.classesDirs, classpath = sourceSets.${name}.runtimeClasspath) so ${test.simple} runs: no test task runs that source set, so its tests never run.`,
      ),
    ),
  );
}

export function readUnrunTestFindings(context) {
  return context.manifest.build === 'maven' ? mavenFindings(context) : gradleFindings(context);
}
