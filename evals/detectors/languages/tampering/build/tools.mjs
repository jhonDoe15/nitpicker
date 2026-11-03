const NAMES =
  'jacoco|pitest|checkstyle|pmd|spotbugs|detekt|ktlint|ktfmt|spotless|sonar|archunit|surefire|failsafe';
const TEST_TASK = String.raw`(?:tasks\.)?(?:test|check|integrationTest)`;

// Words that name a test, coverage or analysis tool, or a setting that stops one from failing.
export const TOOLS = new RegExp(
  String.raw`(?<!\w)(?:-D)?(?:${[
    String.raw`(?:${NAMES})\w*`,
    String.raw`error[-_]?prone|nullaway|enforcer`,
    'violationRules|mutationThreshold|coverageThreshold',
    'ignoreFailures|isIgnoreFailures|failOnViolation|failOnError|allWarningsAsErrors|Werror',
    String.raw`skipTests|skipITs|testFailureIgnore|failIfNoTests|maven\.test\.\w+|testExcludes?`,
    'fail-never|excludedTaskNames|startParameter',
    String.raw`junit\.jupiter\.[\w.]*deactivate|onlyIf\s*\{\s*false`,
    String.raw`${TEST_TASK}\s*\.\s*(?:enabled|isEnabled|setEnabled|onlyIf|setOnlyIf|setDependsOn|exclude\w*|setExcludes|filter|ignoreFailures)`,
    String.raw`${TEST_TASK}\s*\.\s*dependsOn\s*\.\s*clear`,
    String.raw`(?<=-D)test(?==)`,
  ].join('|')})(?!\w)`,
  'iu',
);

// What a test block may be given to run fewer tests or to ignore their failure.
export const TEST_SETTINGS =
  /\b(?:exclude\w*|include\w*|set(?:Excludes|Includes|Enabled|OnlyIf|IgnoreFailures)|filter|enabled|isEnabled|onlyIf|useJUnit\w*|useTestNG|useKotlinTest|ignoreFailures|failFast|testClassesDirs|classpath)\b/u;

const PROJECT = String.raw`(?:(?:root)?[Pp]roject\s*\.\s*)?`;
const TEST_NAME = String.raw`["'](?:test|check|integrationTest)["']`;
// The head of a Gradle block that configures the test task: `test`, `tasks.test`,
// `tasks.named<Test>("test")`, `tasks.getByName("check")`, `tasks.withType<Test>().configureEach`.
export const TEST_BLOCK = new RegExp(
  [
    String.raw`^${PROJECT}(?:tasks\.)?(?:test|check|integrationTest|testClasses|testing)(?:\s*\.\s*configure)?$`,
    String.raw`^${PROJECT}tasks\s*\.\s*(?:named|getByName|findByName|replace|register|create)\b[^"']*${TEST_NAME}`,
    String.raw`^${PROJECT}tasks\s*\.\s*withType\b.*\bTest\b`,
    String.raw`^${PROJECT}tasks\s*\.\s*matching\b`,
  ].join('|'),
  'u',
);

// A line that declares a plugin or a dependency, which adds a capability and changes no setting.
export const GRADLE_DECLARATION = new RegExp(
  String.raw`^(?:id|alias|kotlin|apply|plugin|[a-z]\w*(?:Implementation|Api|Only|Processor|Plugins|Agent|Ant)|implementation|api|kapt|ksp|checkstyle|pmd|spotbugs\w*|jacoco\w*|detekt\w*|ktlint\w*)\b\s*(?:\(\s*)?(?:platform\s*\(\s*|enforcedPlatform\s*\(\s*|project\s*\(\s*|kotlin\s*\(|libs\.|plugin\s*:|["'])`,
  'u',
);
export const MAVEN_STRUCTURE = /^<\/?(?:plugin|groupId|artifactId|version)\b/u;

// Content that lowers a threshold, skips a check or ignores a failure, even in something new.
export const RISKY =
  /(?:exclude|skip|ignore|enabled|failOn|failIf|halt|minimum|maximum|threshold|ratio|limit|deactivate|onlyIf|failFast|allWarningsAsErrors|Werror|testFailureIgnore|filter)\w*|=\s*false\b|>\s*false\s*</iu;
