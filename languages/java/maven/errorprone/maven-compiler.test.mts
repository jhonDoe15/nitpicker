import { describe, expect, it } from 'vitest';
import { parseXml } from '../../../../shared/ingest/report-records.mts';
import { defined } from '../../builds/test-support/defined.mts';
import { compilerSettings } from './maven-compiler.mts';
import { processorTool } from './maven-errorprone.mts';

const project = (body: string) =>
  parseXml(`<project><artifactId>app</artifactId>${body}</project>`);

const SPRING_STYLE = `
<properties>
  <java.version>21</java.version>
  <maven.compiler.release>21</maven.compiler.release>
  <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
</properties>
<dependencyManagement><dependencies>
  <dependency><groupId>org.projectlombok</groupId><artifactId>lombok</artifactId><version>1.18.36</version></dependency>
</dependencies></dependencyManagement>
<build><plugins>
  <plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-compiler-plugin</artifactId>
    <configuration>
      <compilerArgs><arg>-parameters</arg><arg>--enable-preview</arg></compilerArgs>
      <annotationProcessorPaths>
        <path><groupId>org.projectlombok</groupId><artifactId>lombok</artifactId></path>
        <path>
          <groupId>org.mapstruct</groupId><artifactId>mapstruct-processor</artifactId><version>1.6.3</version>
        </path>
      </annotationProcessorPaths>
    </configuration>
  </plugin>
</plugins></build>`;

describe('compilerSettings', () => {
  it('reads release, encoding, compiler arguments and processor paths, with managed versions', () => {
    expect(compilerSettings(project(SPRING_STYLE))).toStrictEqual({
      release: '21',
      source: undefined,
      target: undefined,
      encoding: 'UTF-8',
      compilerArgs: ['-parameters', '--enable-preview'],
      proc: undefined,
      processorPaths: [
        'org.projectlombok:lombok:1.18.36',
        'org.mapstruct:mapstruct-processor:1.6.3',
      ],
      test: {
        release: '21',
        source: undefined,
        target: undefined,
        compilerArgs: ['-parameters', '--enable-preview'],
      },
    });
  });

  it('gives the test pass its own level and arguments, from test properties and default-testCompile', () => {
    const settings = compilerSettings(
      project(`<properties>
          <maven.compiler.release>17</maven.compiler.release>
          <maven.compiler.testRelease>21</maven.compiler.testRelease>
        </properties>
        <build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId>
        <configuration><compilerArgument>-Xlint:all -parameters</compilerArgument></configuration>
        <executions><execution><id>default-testCompile</id><configuration>
          <enablePreview>true</enablePreview><compilerArgs><arg>-Atest=true</arg></compilerArgs>
        </configuration></execution></executions></plugin></plugins></build>`),
    );

    expect([settings.release, settings.compilerArgs, settings.test]).toStrictEqual([
      '17',
      ['-Xlint:all', '-parameters'],
      {
        release: '21',
        source: undefined,
        target: undefined,
        compilerArgs: ['-Atest=true', '-Xlint:all', '-parameters', '--enable-preview'],
      },
    ]);
  });

  it('reads the default compile includes and excludes, and each extra compile execution with its own level', () => {
    const settings = compilerSettings(
      project(`<properties><maven.compiler.release>8</maven.compiler.release></properties>
        <build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId>
        <configuration>
          <excludes><exclude>org/example/jwk/EdEcKeys.java</exclude></excludes>
          <testExcludes><testExclude>**/Slow*.java</testExclude></testExcludes>
        </configuration>
        <executions>
          <execution><id>compile-java15</id><goals><goal>compile</goal></goals><configuration>
            <includes><include>org/example/jwk/EdEcKeys.java</include></includes>
            <excludes combine.self="override" />
            <release>15</release>
          </configuration></execution>
          <execution><id>java9-module</id><goals><goal>compile</goal></goals><configuration>
            <compileSourceRoots><compileSourceRoot>src/main/java9</compileSourceRoot></compileSourceRoots>
          </configuration></execution>
          <execution><id>off</id><phase>none</phase><goals><goal>compile</goal></goals></execution>
        </executions></plugin></plugins></build>`),
    );

    expect([settings.sources, settings.test?.sources, settings.executions]).toStrictEqual([
      { includes: [], excludes: ['org/example/jwk/EdEcKeys.java'] },
      { includes: [], excludes: ['**/Slow*.java'] },
      [
        {
          id: 'compile-java15',
          release: '15',
          source: undefined,
          target: undefined,
          compilerArgs: [],
          sources: { includes: ['org/example/jwk/EdEcKeys.java'], excludes: [] },
        },
      ],
    ]);
  });

  it("treats an empty release as missing and falls back to the plugin's own default level", () => {
    const level = (body: string) => {
      const { release, source, target } = compilerSettings(project(body));
      return [release, source, target];
    };
    const plugin = (version: string, configuration = '') =>
      `<build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId><version>${version}</version>` +
      `<configuration>${configuration}</configuration></plugin></plugins></build>`;

    expect([
      level(plugin('3.13.0', '<release/>')),
      level(plugin('3.8.1')),
      level(plugin('4.0.0-beta-2')),
      level(plugin('3.13.0', '<release>21</release>')),
    ]).toStrictEqual([
      [undefined, '8', '8'],
      [undefined, '8', '8'],
      [undefined, undefined, undefined],
      ['21', undefined, undefined],
    ]);
  });

  it('keeps source and target apart from release, and reads proc from the plugin configuration', () => {
    const settings = compilerSettings(
      project(`<properties><maven.compiler.source>1.8</maven.compiler.source></properties>
        <build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId>
        <configuration><target>1.8</target><proc>none</proc></configuration></plugin></plugins></build>`),
    );

    expect([
      settings.release,
      settings.source,
      settings.target,
      settings.proc,
      settings.processorPaths,
    ]).toStrictEqual([undefined, '1.8', '1.8', 'none', undefined]);
  });

  it('treats a setting the effective POM leaves unresolved as unset', () => {
    const settings = compilerSettings(
      project(`<properties><maven.compiler.target>\${java.version}</maven.compiler.target></properties>
        <build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId>
        <configuration><release>\${release}</release><source>11</source></configuration>
        </plugin></plugins></build>`),
    );

    expect([settings.release, settings.source, settings.target]).toStrictEqual([
      undefined,
      '11',
      undefined,
    ]);
  });

  it('prefers the default-compile execution over the plugin configuration', () => {
    const settings = compilerSettings(
      project(`<build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId>
        <configuration><release>17</release><compilerArgs><arg>-Xlint</arg></compilerArgs></configuration>
        <executions>
          <execution><id>default-testCompile</id><configuration><release>21</release></configuration></execution>
          <execution><id>default-compile</id><configuration>
            <release>11</release><compilerArgs><arg>-Aquiet=true</arg></compilerArgs>
          </configuration></execution>
        </executions></plugin></plugins></build>`),
    );

    expect([settings.release, settings.compilerArgs]).toStrictEqual(['11', ['-Aquiet=true']]);
  });

  it('reads the processor output folders from default-compile, default-testCompile or the plugin', () => {
    const settings = compilerSettings(
      project(`<build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId>
        <configuration><generatedSourcesDirectory> /work/gen </generatedSourcesDirectory></configuration>
        <executions><execution><id>default-testCompile</id><configuration>
          <generatedTestSourcesDirectory>gen-tests</generatedTestSourcesDirectory>
        </configuration></execution></executions></plugin></plugins></build>`),
    );
    const unresolved = compilerSettings(
      project(`<build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId><configuration>
        <generatedSourcesDirectory>\${gen}</generatedSourcesDirectory></configuration></plugin></plugins></build>`),
    );

    expect([settings.generatedSources, settings.test?.generatedSources]).toStrictEqual([
      '/work/gen',
      'gen-tests',
    ]);
    expect([unresolved.generatedSources, unresolved.test?.generatedSources]).toStrictEqual([
      undefined,
      undefined,
    ]);
  });

  it('names the coordinate when a processor path has no version the effective POM resolves', () => {
    const withPath = (path: string, managed = '') =>
      project(`<dependencyManagement><dependencies>${managed}</dependencies></dependencyManagement>
        <dependencies><dependency><groupId>org.projectlombok</groupId><artifactId>lombok</artifactId>
        <version>1.18.36</version></dependency></dependencies>
        <build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId><configuration>
        <annotationProcessorPaths><path>${path}</path></annotationProcessorPaths>
        </configuration></plugin></plugins></build>`);
    const lombok = '<groupId>org.projectlombok</groupId><artifactId>lombok</artifactId>';
    const message = (found: string) =>
      "maven-compiler-plugin's annotationProcessorPaths names org.projectlombok:lombok without a " +
      `version the effective POM resolves (${found}). Give the path a <version>, or manage ` +
      'the artifact in dependencyManagement';

    expect(() => compilerSettings(withPath(lombok))).toThrow(
      message('no <version> and none in dependencyManagement'),
    );
    expect(() =>
      compilerSettings(withPath(`${lombok}<version>\${lombok.version}</version>`)),
    ).toThrow(message('${lombok.version}'));
    expect(() =>
      compilerSettings(
        withPath(lombok, `<dependency>${lombok}<version>\${lombok.version}</version></dependency>`),
      ),
    ).toThrow(message('${lombok.version}'));
  });
});

describe('processorRepositories', () => {
  it('carries the repositories the project declares, without central, into the processor tool', () => {
    const settings = compilerSettings(
      project(`<repositories>
          <repository><id>central</id><url>https://repo.maven.apache.org/maven2</url></repository>
          <repository><id>plugins</id><url>https://repo.example.org/public/?a=1&amp;b=2</url>
            <snapshots><enabled>false</enabled></snapshots></repository>
        </repositories>${SPRING_STYLE}`),
    );
    const plain = defined(processorTool(compilerSettings(project(SPRING_STYLE))));
    const tool = defined(processorTool(settings));

    expect(settings.processorRepositories).toEqual([
      '<repository><id>plugins</id><url>https://repo.example.org/public/?a=1&amp;b=2</url>' +
        '<snapshots><enabled>false</enabled></snapshots></repository>',
    ]);
    expect(tool.repositories).toEqual(settings.processorRepositories);
    expect(tool.name).not.toBe(plain.name);
    expect(plain.repositories).toBeUndefined();
  });

  it('names an extra compile without an id and a repository without an id by its url', () => {
    const settings = compilerSettings(
      project(`<repositories>
          <repository><url>https://repo.example.org/m2</url><layout>default</layout></repository>
        </repositories>
        <build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId><executions>
          <execution><goals><goal>compile</goal></goals></execution>
        </executions></plugin></plugins></build>`),
    );

    expect(settings.processorRepositories).toEqual([
      '<repository><id>https://repo.example.org/m2</id><url>https://repo.example.org/m2</url>' +
        '<layout>default</layout></repository>',
    ]);
    expect(settings.executions?.map(({ id }) => id)).toEqual(['default']);
  });
});

describe('processorTool', () => {
  it('names one tool set per distinct list of processor paths, and none without paths', () => {
    const lombok = compilerSettings(project(SPRING_STYLE));
    const tool = defined(processorTool(lombok));

    expect(tool.coordinates).toEqual(lombok.processorPaths);
    expect(tool.name).toMatch(/^processors-[0-9a-f]{16}$/);
    expect(processorTool({ ...lombok })?.name).toBe(tool.name);
    expect(processorTool({ processorPaths: undefined })).toBeUndefined();
  });
});
