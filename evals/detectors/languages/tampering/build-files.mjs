import { maskCLike } from '../masking/c-like.mjs';
import { changedOccurrences } from '../occurrences.mjs';

const BUILD_FILE = /(?:^|\/)(?:build\.gradle(?:\.kts)?|pom\.xml)$/u;

// Words that name a test, coverage or analysis tool, or a setting that stops one from failing.
const TOOLS = new RegExp(
  String.raw`\b(?:${[
    String.raw`(?:jacoco|pitest|checkstyle|pmd|spotbugs|detekt|ktlint|ktfmt|spotless|sonar|archunit|surefire|failsafe)\w*`,
    String.raw`error[-_]?prone|nullaway|enforcer`,
    'violationRules|mutationThreshold|coverageThreshold',
    'ignoreFailures|isIgnoreFailures|failOnViolation|failOnError|allWarningsAsErrors|Werror',
    String.raw`skipTests|skipITs|testFailureIgnore|maven\.test\.\w+`,
  ].join('|')})\b`,
  'iu',
);
// What a test block may be given to run fewer tests or to ignore their failure.
const TEST_SETTINGS =
  /\b(?:exclude\w*|include\w*|filter|enabled|isEnabled|onlyIf|useJUnit\w*|useTestNG|useKotlinTest|ignoreFailures|failFast|testClassesDirs|classpath)\b/u;
const TEST_BLOCK =
  /^(?:test|testing|tasks\.test|tasks\.withType\s*[<(]\s*Test\b.*|tasks\.named\s*[<(]\s*["']test["'].*)$/u;

function openedHeads(line) {
  const heads = [];
  let start = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '{') {
      heads.push(line.slice(start, index).trim());
      start = index + 1;
    }
  }
  return heads;
}

const closedBlocks = (line) => [...line].filter((character) => character === '}').length;

function isGateLine({ line, scope }) {
  const inTest = scope.some((head) => TEST_BLOCK.test(head));
  return (
    TOOLS.test(line) ||
    scope.some((head) => TOOLS.test(head)) ||
    (inTest && TEST_SETTINGS.test(line))
  );
}

function gradleGateLines(file, text) {
  const { masked } = maskCLike(text, { kotlin: file.endsWith('.kts'), keepStrings: true });
  const stack = [];
  const gate = [];
  for (const line of masked.split('\n').map((candidate) => candidate.trim())) {
    const opened = openedHeads(line);
    if (line !== '' && isGateLine({ line, scope: [...stack, ...opened] })) gate.push(line);
    stack.length = Math.max(0, stack.length - closedBlocks(line));
    stack.push(...opened);
  }
  return gate;
}

const trimmedLines = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

function mavenGateLines(text) {
  let rest = text.replaceAll(/<!--[\s\S]*?-->/gu, '');
  const gate = [];
  for (const [block] of rest.matchAll(/<plugin>[\s\S]*?<\/plugin>/gu)) {
    if (TOOLS.test(/<artifactId>([^<]*)</u.exec(block)?.[1] ?? '')) {
      gate.push(...trimmedLines(block));
      rest = rest.replace(block, '');
    }
  }
  return [...gate, ...trimmedLines(rest).filter((line) => TOOLS.test(line))];
}

export const isBuildFile = (file) => BUILD_FILE.test(file);

/**
 * The lines of a Gradle or Maven build file that touch test, coverage or analysis settings: any
 * line naming such a tool or setting (a plugin, a dependency on it, `ignoreFailures`, `skipTests`),
 * every line inside a block of one (`jacoco { ... }`, a Maven plugin of one), and the lines of a
 * test block that choose which tests run (`exclude`, `filter`, `enabled`, `useJUnitPlatform`).
 */
export function gateLinesOf(file, text) {
  return file.endsWith('pom.xml') ? mavenGateLines(text) : gradleGateLines(file, text);
}

/**
 * Compares the gate lines of a build file before and after: a change that only adds a dependency
 * or edits another part of the build reports nothing. Returns the lines added and removed.
 */
export function changedGateLines(file, before, after) {
  const keyed = (text) => gateLinesOf(file, text ?? '').map((line) => ({ key: line }));
  const { added, removed } = changedOccurrences(keyed(before), keyed(after));
  return { added: added.map(({ key }) => key), removed: removed.map(({ key }) => key) };
}
