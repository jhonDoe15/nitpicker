const TEST_ANNOTATIONS = new Set([
  'org.junit.Test',
  'org.junit.jupiter.api.Test',
  'org.junit.jupiter.api.RepeatedTest',
  'org.junit.jupiter.api.TestFactory',
  'org.junit.jupiter.api.TestTemplate',
  'org.junit.jupiter.params.ParameterizedTest',
  'org.testng.annotations.Test',
  'com.tngtech.archunit.junit.ArchTest',
  'junit.framework.TestCase',
]);
const SPEC_STYLES = 'io.kotest.core.spec.style.';
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

export function isTestMarker(className) {
  return TEST_ANNOTATIONS.has(className) || className.startsWith(SPEC_STYLES);
}

export function isFrameworkBridge(className) {
  return (
    BRIDGE_CLASSES.has(className) || BRIDGE_PATTERNS.some((pattern) => pattern.test(className))
  );
}
