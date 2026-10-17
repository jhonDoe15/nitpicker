import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const LOMBOK = '1.18.30';

const SOURCES = {
  'src/main/java/shop/Item.java': `package shop;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class Item {
  private final String name;
  private final int priceCents;
  private final boolean taxable;
}
`,
  'src/main/java/shop/Discount.java': `package shop;

public class Discount {
  public int apply(int cents) {
    if (cents > 100) {
      return cents - 10;
    }
    return cents;
  }

  public int rare(int cents) {
    return cents * 2;
  }
}
`,
  'src/test/java/shop/ShopTest.java': `package shop;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class ShopTest {
  @Test
  void readsAnItem() {
    var item = Item.builder().name("a").priceCents(3).taxable(true).build();
    assertEquals("a", item.getName());
  }

  @Test
  void discountsLargeAmounts() {
    assertEquals(190, new Discount().apply(200));
    assertEquals(50, new Discount().apply(50));
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
    testImplementation 'org.junit.jupiter:junit-jupiter:5.11.0'
    testRuntimeOnly 'org.junit.platform:junit-platform-launcher'
}
test {
    useJUnitPlatform()
}
`;

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
    <dependency>
      <groupId>org.projectlombok</groupId><artifactId>lombok</artifactId>
      <version>${LOMBOK}</version><scope>provided</scope>
    </dependency>
    <dependency>
      <groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId>
      <version>5.11.0</version><scope>test</scope>
    </dependency>
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

const roots = [];

function project(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-lombok-generated-')));
  roots.push(root);
  for (const [file, content] of Object.entries({ ...SOURCES, ...files })) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

const coverageAndMutants = (findings) =>
  findings
    .filter(({ tool }) => tool === 'jacoco' || tool === 'pit')
    .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`)
    .sort();

const ONLY_THE_WRITTEN_CODE = [
  'jacoco line-coverage src/main/java/shop/Discount.java',
  'jacoco uncovered-method src/main/java/shop/Discount.java',
  'pit mutant-nocoverage src/main/java/shop/Discount.java',
  'pit mutant-nocoverage src/main/java/shop/Discount.java',
  'pit mutant-survived src/main/java/shop/Discount.java',
  'pit mutation-summary .',
  'pit mutation-summary .',
  'pit mutation-summary .',
];

describe.skipIf(!enabled)(
  'Coverage and mutation testing on a Lombok project older than 1.18.34',
  () => {
    afterAll(() => {
      for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true });
    });

    it('reports no coverage or mutants for the Lombok-generated members of a Gradle project', () => {
      const root = project({
        'settings.gradle': "rootProject.name = 'shop'\n",
        'build.gradle': BUILD_GRADLE,
      });

      expect(coverageAndMutants(collectJavaFindings(root, { gradle, policy: {} }))).toEqual(
        ONLY_THE_WRITTEN_CODE,
      );
      expect(readFileSync(path.join(root, 'lombok.config'), 'utf8')).toBe(
        'lombok.addLombokGeneratedAnnotation = true\n',
      );
    });

    it('does the same on Maven and keeps the project own lombok.config settings', () => {
      const root = project({
        'pom.xml': POM,
        'lombok.config':
          'config.stopBubbling = true\nlombok.addLombokGeneratedAnnotation = false\n',
      });

      expect(coverageAndMutants(collectJavaFindings(root, { maven, policy: {} }))).toEqual(
        ONLY_THE_WRITTEN_CODE,
      );
      expect(readFileSync(path.join(root, 'lombok.config'), 'utf8')).toBe(
        'config.stopBubbling = true\nlombok.addLombokGeneratedAnnotation = true\n',
      );
    });
  },
);
