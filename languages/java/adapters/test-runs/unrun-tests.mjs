import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { inModule } from '../../builds/module-path.mjs';
import { TEST_DECLARATION } from '../test-runtime/test-markers.mjs';
import { isAbstract } from '../test-runtime/test-sources.mjs';

const TOOL = 'test-runtime';
const UNRUN_TEST_RULE = 'test-not-run';
export const UNRUN_TEST_EXCEPTION_RULE = `${TOOL}/${UNRUN_TEST_RULE}`;

export const UNRUN_TEST_ADVICE = {
  maven: ({ test }) =>
    `Bind the integration-test and verify goals of maven-failsafe-plugin in this module so ${test} runs: Surefire skips classes named IT*, *IT and *ITCase, and Failsafe does not run here, so its tests never run.`,
  gradle: ({ sourceSet, test }) =>
    `Register a Test task for the ${sourceSet} source set (testClassesDirs = sourceSets.${sourceSet}.output.classesDirs, classpath = sourceSets.${sourceSet}.runtimeClasspath) so ${test} runs: no test task runs that source set, so its tests never run.`,
};
const TEST_RESULTS = 'test-results';
const SOURCE_FILE = /\.(?:java|kt|groovy)$/u;
const FAILSAFE_NAME = /^IT|IT$|ITCase$/u;
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
    .filter(({ text, simple }) => TEST_DECLARATION.test(text) && !isAbstract(text, simple));
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
    .map((test) => finding(test, UNRUN_TEST_ADVICE.maven({ test: test.simple })));
}

function gradleFindings(context) {
  return (context.manifest.unrunTestSourceSets ?? []).flatMap(({ name, roots }) =>
    testClasses(context, roots).map((test) =>
      finding(test, UNRUN_TEST_ADVICE.gradle({ sourceSet: name, test: test.simple })),
    ),
  );
}

export function readUnrunTestFindings(context) {
  return context.manifest.build === 'maven' ? mavenFindings(context) : gradleFindings(context);
}
