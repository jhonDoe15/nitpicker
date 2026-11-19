const JUNIT = `
dependencies {
    testImplementation platform('org.junit:junit-bom:5.13.4')
    testImplementation 'org.junit.jupiter:junit-jupiter'
    testRuntimeOnly 'org.junit.platform:junit-platform-launcher'
}
test {
    useJUnitPlatform()
}
`;

const VERIFICATION = `<?xml version="1.0" encoding="UTF-8"?>
<verification-metadata xmlns="https://schema.gradle.org/dependency-verification"
                       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                       xsi:schemaLocation="https://schema.gradle.org/dependency-verification https://schema.gradle.org/dependency-verification/dependency-verification-1.3.xsd">
   <configuration>
      <verify-metadata>true</verify-metadata>
      <verify-signatures>false</verify-signatures>
      <trusted-artifacts>
         <trust group="^org[.](junit|opentest4j|apiguardian)([.].*)?$" regex="true"/>
      </trusted-artifacts>
   </configuration>
   <components/>
</verification-metadata>
`;

const MODULE_PATH_PROVIDER = `
class ModulePathArguments implements CommandLineArgumentProvider {
    @Classpath
    final FileCollection modules

    ModulePathArguments(FileCollection modules) {
        this.modules = modules
    }

    @Override
    Iterable<String> asArguments() {
        ['--module-path=' + modules.asPath]
    }
}

dependencies {
    implementation project(':platform:base')
}

tasks.named('compileJava') {
    options.compilerArgumentProviders.add(new ModulePathArguments(configurations.compileClasspath))
    classpath = files()
}
`;

export const LARGE_BUILD_FILES: Readonly<Record<string, string>> = {
  'settings.gradle':
    "rootProject.name = 'large'\ninclude 'platform', 'platform:base', 'platform:api'\n",
  'build.gradle':
    "allprojects {\n    apply plugin: 'java'\n    repositories {\n        mavenCentral()\n    }\n}\n",
  'gradle/verification-metadata.xml': VERIFICATION,
  'platform/build.gradle': '',
  'platform/base/build.gradle': `apply plugin: 'jacoco'\n${JUNIT}\ntasks.named('check') {\n    dependsOn 'jacocoTestReport'\n}\n`,
  'platform/base/src/main/java/module-info.java': 'module demo.base {\n  exports demo.base;\n}\n',
  'platform/base/src/main/java/demo/base/Counter.java':
    'package demo.base;\n\npublic final class Counter {\n  private int unused;\n\n' +
    '  public int next(int value) {\n    return value + 1;\n  }\n}\n',
  'platform/base/src/test/java/demo/base/CounterTest.java':
    'package demo.base;\n\nimport static org.junit.jupiter.api.Assertions.assertEquals;\n\n' +
    'import org.junit.jupiter.api.Test;\n\nclass CounterTest {\n  @Test\n  void countsOn() {\n' +
    '    assertEquals(2, new Counter().next(1));\n  }\n}\n',
  'platform/api/build.gradle': MODULE_PATH_PROVIDER,
  'platform/api/src/main/java/module-info.java': 'module demo.api {\n  requires demo.base;\n}\n',
  'platform/api/src/main/java/demo/api/Greeter.java':
    'package demo.api;\n\nimport demo.base.Counter;\n\npublic final class Greeter {\n' +
    '  public void greet() {\n    System.out.println(new Counter().next(1));\n  }\n}\n',
};
