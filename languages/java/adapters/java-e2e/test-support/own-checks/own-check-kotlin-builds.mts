import { DEPENDENCIES, type Dependency } from './own-check-support.mts';

const KOTLIN_VERSION = '2.0.21';

function gradleDependency([group, artifact, version, scope]: Dependency): string {
  const configuration = scope === 'test' ? 'testImplementation' : 'implementation';
  return `    ${configuration}("${group}:${artifact}:${version}")`;
}

function mavenDependency([group, artifact, version, scope]: Dependency): string {
  const scoped = scope === 'test' ? '<scope>test</scope>' : '';
  const coordinates = `<groupId>${group}</groupId><artifactId>${artifact}</artifactId>`;
  return `    <dependency>${coordinates}<version>${version}</version>${scoped}</dependency>`;
}

const MAIN_KOTLIN = { 'src/main/kotlin/demo/Main.kt': 'package demo\n\nfun main() {}\n' };

export const KOTLIN_BUILDS = {
  gradle: {
    ...MAIN_KOTLIN,
    'build.gradle.kts': `plugins { kotlin("jvm") version "${KOTLIN_VERSION}" }
repositories { mavenCentral() }
dependencies {
${DEPENDENCIES.map(gradleDependency).join('\n')}
}
`,
    'settings.gradle.kts': 'rootProject.name = "demo"\n',
  },
  maven: {
    ...MAIN_KOTLIN,
    'pom.xml': `<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>demo</groupId>
  <artifactId>demo</artifactId>
  <version>1</version>
  <properties>
    <kotlin.version>${KOTLIN_VERSION}</kotlin.version>
    <maven.compiler.release>21</maven.compiler.release>
    <kotlin.compiler.jvmTarget>21</kotlin.compiler.jvmTarget>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.jetbrains.kotlin</groupId>
      <artifactId>kotlin-stdlib</artifactId>
      <version>\${kotlin.version}</version>
    </dependency>
${DEPENDENCIES.map(mavenDependency).join('\n')}
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.jetbrains.kotlin</groupId>
        <artifactId>kotlin-maven-plugin</artifactId>
        <version>\${kotlin.version}</version>
        <executions>
          <execution>
            <id>compile</id>
            <phase>compile</phase>
            <goals><goal>compile</goal></goals>
            <configuration>
              <sourceDirs>
                <sourceDir>\${project.basedir}/src/main/kotlin</sourceDir>
                <sourceDir>\${project.basedir}/src/main/java</sourceDir>
              </sourceDirs>
            </configuration>
          </execution>
        </executions>
      </plugin>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <version>3.13.0</version>
        <executions>
          <execution><id>default-compile</id><phase>none</phase></execution>
          <execution><id>default-testCompile</id><phase>none</phase></execution>
          <execution>
            <id>java-compile</id><phase>compile</phase><goals><goal>compile</goal></goals>
          </execution>
          <execution>
            <id>java-test-compile</id><phase>test-compile</phase><goals><goal>testCompile</goal></goals>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
</project>
`,
  },
};
