export const POM = `<project>
  <modelVersion>4.0.0</modelVersion>
  <artifactId>shop</artifactId>
</project>
`;

export const FAILSAFE_POM = POM.replace(
  '</project>',
  '  <build><plugins><plugin><artifactId>maven-failsafe-plugin</artifactId></plugin></plugins></build>\n</project>',
);

export const ORDER_IT = `package shop;

import org.junit.jupiter.api.Test;

class OrderIT {
  OrderIT() {}

  @Test
  void places() {}
}
`;

export const ORDER_INTEGRATION_TEST = ORDER_IT.replaceAll('OrderIT', 'OrderIntegrationTest');

export const GRADLE_KTS = `plugins {
    java
}

sourceSets {
    create("integrationTest") {
        compileClasspath += sourceSets["main"].output
        runtimeClasspath += sourceSets["main"].output
    }
}
`;

export const GRADLE_GROOVY = `plugins {
    id 'java'
}

sourceSets {
    integrationTest {
        compileClasspath += sourceSets.main.output
        runtimeClasspath += sourceSets.main.output
    }
}
`;

export const JUPITER_TEST = `package shop;

import org.junit.jupiter.api.Test;

class OrderTest {
  @Test
  void places() {}
}
`;

export const KTS_TASK = `
tasks.register<Test>("integrationTest") {
    description = "Runs the integrationTest source set."
    group = "verification"
    testClassesDirs = sourceSets["integrationTest"].output.classesDirs
    classpath = sourceSets["integrationTest"].runtimeClasspath
    shouldRunAfter(tasks.named("test"))
    useJUnitPlatform()
}

tasks.named("check") {
    dependsOn("integrationTest")
}
`;

export const GROOVY_TASK = `
tasks.register('integrationTest', Test) {
    description = 'Runs the integrationTest source set.'
    group = 'verification'
    testClassesDirs = sourceSets['integrationTest'].output.classesDirs
    classpath = sourceSets['integrationTest'].runtimeClasspath
    shouldRunAfter tasks.named('test')
    useJUnitPlatform()
}

tasks.named('check') {
    dependsOn 'integrationTest'
}
`;

export const ORDER_IT_PATH = 'src/test/java/shop/OrderIT.java';
export const ORDER_INTEGRATION_PATH = 'src/test/java/shop/OrderIntegrationTest.java';
export const SET_TEST_PATH = 'src/integrationTest/java/shop/OrderTest.java';
export const RULE = 'test-runtime/test-not-run';
