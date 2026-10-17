import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../adapters/java-diff.mjs';
import { GRADLE_STEP_TIMEOUT_MS } from '../../adapters/test-support/gradle-e2e.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const maven = process.env.NITPICKER_MAVEN;
const roots = [];

const PARENT_POM = `<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.5.5</version>
    <relativePath/>
  </parent>
  <groupId>demo</groupId>
  <artifactId>parent</artifactId>
  <version>1</version>
  <packaging>pom</packaging>
  <modules><module>app</module></modules>
  <properties>
    <java.version>21</java.version>
    <mapstruct.version>1.6.3</mapstruct.version>
  </properties>
  <build><pluginManagement><plugins>
    <plugin>
      <groupId>org.apache.maven.plugins</groupId>
      <artifactId>maven-compiler-plugin</artifactId>
      <configuration><annotationProcessorPaths>
        <path>
          <groupId>org.mapstruct</groupId>
          <artifactId>mapstruct-processor</artifactId>
          <version>\${mapstruct.version}</version>
        </path>
      </annotationProcessorPaths></configuration>
    </plugin>
  </plugins></pluginManagement></build>
</project>
`;

const APP_POM = `<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent><groupId>demo</groupId><artifactId>parent</artifactId><version>1</version></parent>
  <artifactId>app</artifactId>
  <dependencies>
    <dependency>
      <groupId>org.projectlombok</groupId><artifactId>lombok</artifactId><optional>true</optional>
    </dependency>
    <dependency>
      <groupId>org.mapstruct</groupId><artifactId>mapstruct</artifactId>
      <version>\${mapstruct.version}</version>
    </dependency>
  </dependencies>
  <build><plugins>
    <plugin>
      <groupId>org.apache.maven.plugins</groupId>
      <artifactId>maven-antrun-plugin</artifactId>
      <executions><execution>
        <id>generate</id>
        <phase>generate-sources</phase>
        <goals><goal>run</goal></goals>
        <configuration><target>
          <mkdir dir="\${project.build.outputDirectory}"/>
          <javac srcdir="src/gen/java" destdir="\${project.build.outputDirectory}" includeantruntime="false"/>
        </target></configuration>
      </execution></executions>
    </plugin>
    <plugin>
      <groupId>org.apache.maven.plugins</groupId>
      <artifactId>maven-compiler-plugin</artifactId>
      <configuration><annotationProcessorPaths combine.children="append">
        <path><groupId>org.projectlombok</groupId><artifactId>lombok</artifactId></path>
      </annotationProcessorPaths></configuration>
    </plugin>
  </plugins></build>
</project>
`;

const SOURCES = {
  'app/src/gen/java/demo/gen/Version.java': `package demo.gen;

public final class Version {
  public static final String NAME = "v1";

  private Version() {}
}
`,
  'app/src/main/java/demo/app/Car.java': `package demo.app;

import lombok.Data;

@Data
public class Car {
  private String make = "";
  private int seats;
}
`,
  'app/src/main/java/demo/app/CarDto.java': `package demo.app;

public record CarDto(String make, int seats) {}
`,
  'app/src/main/java/demo/app/CarMapper.java': `package demo.app;

import org.mapstruct.Mapper;

@Mapper
public interface CarMapper {
  CarDto toDto(Car car);
}
`,
  'app/src/main/java/demo/app/Garage.java': `package demo.app;

import demo.gen.Version;
import java.util.List;
import org.mapstruct.factory.Mappers;

public final class Garage {
  private static final CarMapper MAPPER = Mappers.getMapper(CarMapper.class);

  public String describe(List<Car> cars) {
    cars.isEmpty();
    return Version.NAME + cars.stream().map(MAPPER::toDto).toList();
  }
}
`,
};

function project() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-errorprone-')));
  roots.push(root);
  const files = { 'pom.xml': PARENT_POM, 'app/pom.xml': APP_POM, ...SOURCES };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

afterAll(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!enabled)('Error Prone on a Spring Initializr style Maven build', () => {
  it(
    'takes the processors from the parent and the Boot BOM, and resolves classes generated into target/classes',
    () => {
      const findings = collectJavaFindings(project(), { maven, policy: {} })
        .filter(
          (finding) => finding.tool === 'errorprone' || finding.classification === 'tool-error',
        )
        .map(({ tool, rule, path: file, location }) => [tool, rule, file, location?.line]);

      expect(findings).toStrictEqual([
        ['errorprone', 'ReturnValueIgnored', 'app/src/main/java/demo/app/Garage.java', 11],
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
