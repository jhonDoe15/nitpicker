import { describe, expect, it } from 'vitest';
import { parseXml } from '../../ingest/common.mjs';
import { compilerSettings } from './compiler-settings.mjs';
import { pluginsOf } from './pom-elements.mjs';
import { processorTool } from '../errorprone/maven-errorprone.mjs';

function compilerOf({ properties = '', configuration = '', executions = '' }) {
  const project = parseXml(
    `<project><groupId>demo</groupId><artifactId>solo</artifactId>
      <properties>${properties}</properties>
      <build><plugins><plugin>
        <artifactId>maven-compiler-plugin</artifactId>
        <configuration>${configuration}</configuration>
        <executions>${executions}</executions>
      </plugin></plugins></build>
    </project>`,
  );
  return compilerSettings(project, pluginsOf(project));
}

describe('compilerSettings', () => {
  it('prefers the default-compile execution and treats unresolved properties as unset', () => {
    const configuration =
      '<release>11</release><encoding>${encoding}</encoding><compilerArgs><arg>-a</arg></compilerArgs>';
    const executions = `<execution><id>default-compile</id>
      <configuration><release>21</release><compilerArgs><arg>-b</arg></compilerArgs></configuration>
    </execution>`;
    const properties = '<maven.compiler.target>${java.version}</maven.compiler.target>';

    expect(compilerOf({ properties, configuration, executions })).toEqual({
      release: '21',
      source: undefined,
      target: undefined,
      encoding: undefined,
      args: ['-b'],
      proc: undefined,
      processorPaths: undefined,
      test: { release: '11', source: undefined, target: undefined, args: ['-a'] },
    });
  });

  it('reads source, target and encoding from the maven.compiler properties before the sourceEncoding', () => {
    const properties = [
      '<maven.compiler.source>11</maven.compiler.source>',
      '<maven.compiler.target>12</maven.compiler.target>',
      '<maven.compiler.encoding>UTF-16</maven.compiler.encoding>',
      '<project.build.sourceEncoding>ISO-8859-1</project.build.sourceEncoding>',
    ].join('');

    expect(compilerOf({ properties })).toEqual({
      release: undefined,
      source: '11',
      target: '12',
      encoding: 'UTF-16',
      args: [],
      proc: undefined,
      processorPaths: undefined,
      test: { release: undefined, source: '11', target: '12', args: [] },
    });
  });

  it.each([
    ['true', ['--enable-preview']],
    ['false', []],
  ])('turns the maven.compiler.enablePreview property %s into %j', (value, args) => {
    const properties = `<maven.compiler.enablePreview>${value}</maven.compiler.enablePreview>`;

    expect(compilerOf({ properties }).args).toEqual(args);
  });

  it('reads compilerArgument from the default-compile execution before the plugin configuration', () => {
    const configuration = '<compilerArgument>-plugin</compilerArgument>';
    const executions = `<execution><id>default-compile</id>
      <configuration><compilerArgument>-parameters  -g</compilerArgument></configuration>
    </execution>`;

    expect(compilerOf({ configuration, executions }).args).toEqual(['-parameters', '-g']);
  });
});

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

describe('compilerSettings on the error-prone shapes', () => {
  it('reads release, encoding, compiler arguments and processor paths, with managed versions', () => {
    expect(compilerSettings(project(SPRING_STYLE))).toStrictEqual({
      release: '21',
      source: undefined,
      target: undefined,
      encoding: 'UTF-8',
      args: ['-parameters', '--enable-preview'],
      proc: undefined,
      processorPaths: [
        'org.projectlombok:lombok:1.18.36',
        'org.mapstruct:mapstruct-processor:1.6.3',
      ],
      test: {
        release: '21',
        source: undefined,
        target: undefined,
        args: ['-parameters', '--enable-preview'],
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

    expect([settings.release, settings.args, settings.test]).toStrictEqual([
      '17',
      ['-Xlint:all', '-parameters'],
      {
        release: '21',
        source: undefined,
        target: undefined,
        args: ['-Atest=true', '-Xlint:all', '-parameters', '--enable-preview'],
      },
    ]);
  });

  it("treats an empty release as missing and falls back to the plugin's own default level", () => {
    const level = (body) => {
      const { release, source, target } = compilerSettings(project(body));
      return [release, source, target];
    };
    const plugin = (version, configuration = '') =>
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

    expect([settings.release, settings.args]).toStrictEqual(['11', ['-Aquiet=true']]);
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
