const TEST_ANNOTATIONS = [
  'org.junit.Test',
  'org.junit.jupiter.api.Test',
  'org.junit.jupiter.api.RepeatedTest',
  'org.junit.jupiter.api.TestFactory',
  'org.junit.jupiter.api.TestTemplate',
  'org.junit.jupiter.params.ParameterizedTest',
  'org.testng.annotations.Test',
  'com.tngtech.archunit.junit.ArchTest',
];
const TEST_SUPERCLASSES = ['junit.framework.TestCase', 'spock.lang.Specification'];
const KOTEST_PACKAGE = 'io.kotest.core.spec.';
const KOTEST_STYLES = [
  'Fun',
  'String',
  'Should',
  'Describe',
  'Behavior',
  'Word',
  'Free',
  'Feature',
  'Expect',
  'Annotation',
].map((style) => `${style}Spec`);
const TEST_MARKERS = new Set([
  ...TEST_ANNOTATIONS,
  ...TEST_SUPERCLASSES,
  `${KOTEST_PACKAGE}Spec`,
  ...KOTEST_STYLES.map((style) => `${KOTEST_PACKAGE}style.${style}`),
]);
const BRIDGE_CLASSES = new Set([
  'org.springframework.boot.test.context.SpringBootTest',
  'org.springframework.test.context.ContextConfiguration',
  'org.springframework.test.context.junit.jupiter.SpringJUnitConfig',
  'org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig',
  'io.quarkus.test.junit.QuarkusTest',
  'io.quarkus.test.junit.QuarkusIntegrationTest',
  'io.quarkus.test.junit.QuarkusMainTest',
  'io.quarkus.test.junit.QuarkusMainIntegrationTest',
  'com.tngtech.archunit.junit.AnalyzeClasses',
  'com.tngtech.archunit.core.importer.ClassFileImporter',
  'org.gradle.testkit.runner.GradleRunner',
]);
const BRIDGE_PATTERNS = [
  /^org\.springframework\.boot\.(?:[a-z][a-z0-9]*\.)*test\.autoconfigure\.(?:[a-z][a-z0-9]*\.)*\w+Test$/u,
  /^io\.micronaut\.test\.extensions\.(?:[a-z][a-z0-9]*\.)*MicronautTest$/u,
];

function simpleName(className) {
  return className.slice(className.lastIndexOf('.') + 1);
}

export const TEST_DECLARATION = new RegExp(
  String.raw`@(?:${TEST_ANNOTATIONS.map(simpleName).join('|')})\b|` +
    String.raw`(?:\bextends\s+|:\s*)(?:${[...TEST_SUPERCLASSES.map(simpleName), ...KOTEST_STYLES].join('|')})\b`,
  'u',
);

export function isTestMarker(className) {
  return TEST_MARKERS.has(className);
}

export function isFrameworkBridge(className) {
  return (
    BRIDGE_CLASSES.has(className) || BRIDGE_PATTERNS.some((pattern) => pattern.test(className))
  );
}
