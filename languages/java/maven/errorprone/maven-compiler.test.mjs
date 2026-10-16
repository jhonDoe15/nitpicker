import { describe, expect, it } from 'vitest';
import { parseXml } from '../../ingest/common.mjs';
import { compilerSettings } from './maven-compiler.mjs';
import { processorTool } from './maven-errorprone.mjs';

const project = (body) => parseXml(`<project><artifactId>app</artifactId>${body}</project>`);

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
    });
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

  it('names the coordinate when a processor path has no version the effective POM resolves', () => {
    const withPath = (path, managed = '') =>
      project(`<dependencyManagement><dependencies>${managed}</dependencies></dependencyManagement>
        <dependencies><dependency><groupId>org.projectlombok</groupId><artifactId>lombok</artifactId>
        <version>1.18.36</version></dependency></dependencies>
        <build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId><configuration>
        <annotationProcessorPaths><path>${path}</path></annotationProcessorPaths>
        </configuration></plugin></plugins></build>`);
    const lombok = '<groupId>org.projectlombok</groupId><artifactId>lombok</artifactId>';
    const message = (found) =>
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

describe('processorTool', () => {
  it('names one tool set per distinct list of processor paths, and none without paths', () => {
    const lombok = compilerSettings(project(SPRING_STYLE));
    const tool = processorTool(lombok);

    expect(tool.coordinates).toEqual(lombok.processorPaths);
    expect(tool.name).toMatch(/^processors-[0-9a-f]{16}$/);
    expect(processorTool({ ...lombok }).name).toBe(tool.name);
    expect(processorTool({ processorPaths: undefined })).toBeUndefined();
  });
});
