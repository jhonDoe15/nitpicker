export type GateLine = { text: string; group?: string | undefined; declaration: boolean };

const NAMES =
  'jacoco|pitest|checkstyle|pmd|spotbugs|detekt|ktlint|ktfmt|spotless|sonar|archunit|surefire|failsafe';
const TEST_TASK = String.raw`(?:tasks\.)?(?:test|check|integrationTest)`;

export const TOOLS = new RegExp(
  String.raw`(?<!\w)(?:-D)?(?:${[
    String.raw`(?:${NAMES})\w*`,
    String.raw`error[-_]?prone|nullaway|enforcer`,
    'violationRules|mutationThreshold|coverageThreshold',
    'ignoreFailures|isIgnoreFailures|failOnViolation|failOnError|allWarningsAsErrors|Werror',
    String.raw`skipTests|skipITs|testFailureIgnore|failIfNoTests|maven\.test\.\w+|testExcludes?`,
    'fail-never|excludedTaskNames|startParameter',
    String.raw`junit\.jupiter\.[\w.]*deactivate|onlyIf\s*\{\s*false`,
    String.raw`${TEST_TASK}\s*\.\s*(?:enabled|isEnabled|setEnabled|onlyIf|setOnlyIf|setDependsOn|exclude\w*|` +
      String.raw`setExcludes|filter|ignoreFailures)`,
    String.raw`${TEST_TASK}\s*\.\s*dependsOn\s*\.\s*clear`,
    String.raw`(?<=-D)test(?==)`,
  ].join('|')})(?!\w)`,
  'iu',
);

export const TEST_SETTINGS = new RegExp(
  [
    String.raw`\b(?:exclude\w*|include\w*|set(?:Excludes|Includes|Enabled|OnlyIf|`,
    String.raw`IgnoreFailures)|filter|enabled|isEnabled|onlyIf|useJUnit\w*|`,
    String.raw`useTestNG|useKotlinTest|ignoreFailures|failFast|testClassesDirs|`,
    String.raw`classpath)\b`,
  ].join(''),
  'u',
);

const PROJECT = String.raw`(?:(?:root)?[Pp]roject\s*\.\s*)?`;
const TEST_NAME = String.raw`["'](?:test|check|integrationTest)["']`;
export const TEST_BLOCK = new RegExp(
  [
    String.raw`^${PROJECT}(?:tasks\.)?(?:test|check|integrationTest|testClasses|testing)(?:\s*\.\s*configure)?$`,
    String.raw`^${PROJECT}tasks\s*\.\s*(?:named|getByName|findByName|replace|register|create)\b[^"']*${TEST_NAME}`,
    String.raw`^${PROJECT}tasks\s*\.\s*withType\b.*\bTest\b`,
    String.raw`^${PROJECT}tasks\s*\.\s*matching\b`,
  ].join('|'),
  'u',
);

export const GRADLE_DECLARATION = new RegExp(
  String.raw`^(?:id|alias|kotlin|apply|plugin|[a-z]\w*(?:Implementation|Api|Only|Processor|Plugin` +
    String.raw`s|Agent|Ant)|implementation|api|kapt|ksp|checkstyle|pmd|spotbugs\w*|jacoco\w*|detekt` +
    String.raw`\w*|ktlint\w*)\b\s*(?:\(\s*)?(?:platform\s*\(\s*|enforcedPlatform\s*\(\s*|project\s*` +
    String.raw`\(\s*|kotlin\s*\(|libs\.|plugin\s*:|["'])`,
  'u',
);
export const MAVEN_STRUCTURE = /^<\/?(?:plugin|groupId|artifactId|version)\b/u;

export const RISKY = new RegExp(
  [
    String.raw`(?:exclude|skip|ignore|enabled|failOn|failIf|halt|minimum|maximum|`,
    String.raw`threshold|ratio|limit|deactivate|onlyIf|failFast|allWarningsAsErrors|`,
    String.raw`Werror|testFailureIgnore|filter)\w*|=\s*false\b|>\s*false\s*<`,
  ].join(''),
  'iu',
);
