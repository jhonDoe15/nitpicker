import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
import { GRADLE_STEP_TIMEOUT_MS } from '../test-support/gradle-e2e.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const LOMBOK = '1.18.36';

const SOURCES = {
  'src/main/java/shop/Item.java': `package shop;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class Item {
  private final String name;
  private final int priceCents;
}
`,
  'src/main/java/shop/Basket.java': `package shop;

import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RequiredArgsConstructor
public class Basket {
  private final List<Item> items;

  public int totalCents() {
    int total = items.stream().mapToInt(Item::getPriceCents).sum();
    log.info("total {}", total);
    return total;
  }

  public boolean check() {
    items.isEmpty();
    return true;
  }
}
`,
  'src/main/java/shop/Wild.java': `package shop;

import lombok.*;

@Getter
@RequiredArgsConstructor
public class Wild {
  private final int count;

  @Deprecated
  private int legacy() {
    return 1;
  }

  @SneakyThrows
  private int helper() {
    return 2;
  }

  @Override
  public String toString() {
    return "w" + count + legacy() + helper();
  }
}
`,
  'src/test/java/shop/BasketTest.java': `package shop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class BasketTest {
  @Test
  void sums() {
    var basket = new Basket(List.of(Item.builder().name("a").priceCents(3).build()));
    assertEquals(3, basket.totalCents());
    assertTrue(basket.check());
  }
}
`,
};

const BUILD_GRADLE = `plugins {
    id 'java'
}
repositories {
    mavenCentral()
}
dependencies {
    compileOnly 'org.projectlombok:lombok:${LOMBOK}'
    annotationProcessor 'org.projectlombok:lombok:${LOMBOK}'
    testCompileOnly 'org.projectlombok:lombok:${LOMBOK}'
    testAnnotationProcessor 'org.projectlombok:lombok:${LOMBOK}'
    implementation 'org.slf4j:slf4j-api:2.0.16'
    testImplementation 'org.junit.jupiter:junit-jupiter:5.11.0'
    testRuntimeOnly 'org.junit.platform:junit-platform-launcher'
}
test {
    useJUnitPlatform()
}
`;

const dependency = (groupId, artifactId, version, scope) =>
  `<dependency><groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId>` +
  `<version>${version}</version>${scope ? `<scope>${scope}</scope>` : ''}</dependency>`;

const POM = `<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>demo</groupId>
  <artifactId>shop</artifactId>
  <version>1</version>
  <properties>
    <maven.compiler.release>21</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
    ${dependency('org.projectlombok', 'lombok', LOMBOK, 'provided')}
    ${dependency('org.slf4j', 'slf4j-api', '2.0.16')}
    ${dependency('org.junit.jupiter', 'junit-jupiter', '5.11.0', 'test')}
  </dependencies>
  <build><plugins>
    <plugin>
      <groupId>org.apache.maven.plugins</groupId>
      <artifactId>maven-compiler-plugin</artifactId>
      <version>3.13.0</version>
      <configuration><annotationProcessorPaths><path>
        <groupId>org.projectlombok</groupId><artifactId>lombok</artifactId><version>${LOMBOK}</version>
      </path></annotationProcessorPaths></configuration>
    </plugin>
    <plugin>
      <groupId>org.apache.maven.plugins</groupId>
      <artifactId>maven-surefire-plugin</artifactId>
      <version>3.5.2</version>
    </plugin>
  </plugins></build>
</project>
`;

const projects = [];

function project(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-lombok-e2e-')));
  projects.push(root);
  for (const [file, content] of Object.entries({ ...SOURCES, ...files })) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

const errorProneAndToolErrors = (findings) =>
  findings
    .filter((finding) => finding.tool === 'errorprone' || finding.classification === 'tool-error')
    .map(({ tool, rule, path: file, location }) => [tool, rule, file, location?.line]);

const ONLY_THE_WRITTEN_CODE = [
  ['errorprone', 'ReturnValueIgnored', 'src/main/java/shop/Basket.java', 19],
  ['errorprone', 'MethodCanBeStatic', 'src/main/java/shop/Wild.java', 10],
];

describe.skipIf(!enabled)('Error Prone on a Lombok project', () => {
  afterAll(() => {
    for (const directory of projects.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it(
    'compiles @Data, @Builder, @RequiredArgsConstructor and @Slf4j classes on Gradle and reports only the written code',
    () => {
      const root = project({
        'settings.gradle': "rootProject.name = 'shop'\n",
        'build.gradle': BUILD_GRADLE,
      });

      expect(errorProneAndToolErrors(collectJavaFindings(root, { gradle, policy: {} }))).toEqual(
        ONLY_THE_WRITTEN_CODE,
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'does the same with lombok.addSuppressWarnings = false, turning off the checks that fail on generated code',
    () => {
      const root = project({
        'settings.gradle': "rootProject.name = 'shop'\n",
        'build.gradle': BUILD_GRADLE,
        'lombok.config': 'config.stopBubbling = true\nlombok.addSuppressWarnings = false\n',
      });

      expect(errorProneAndToolErrors(collectJavaFindings(root, { gradle, policy: {} }))).toEqual(
        ONLY_THE_WRITTEN_CODE,
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'does the same on Maven, with Lombok in annotationProcessorPaths',
    () => {
      const root = project({ 'pom.xml': POM });

      expect(errorProneAndToolErrors(collectJavaFindings(root, { maven, policy: {} }))).toEqual(
        ONLY_THE_WRITTEN_CODE,
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
