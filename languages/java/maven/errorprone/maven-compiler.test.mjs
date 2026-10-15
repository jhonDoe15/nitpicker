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
    expect(compilerSettings(project(SPRING_STYLE))).toEqual({
      release: '21',
      encoding: 'UTF-8',
      compilerArgs: ['-parameters', '--enable-preview'],
      proc: undefined,
      processorPaths: [
        'org.projectlombok:lombok:1.18.36',
        'org.mapstruct:mapstruct-processor:1.6.3',
      ],
    });
  });

  it('falls back to target and source, and reads proc from the plugin configuration', () => {
    const settings = compilerSettings(
      project(`<properties><maven.compiler.source>1.8</maven.compiler.source></properties>
        <build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId>
        <configuration><proc>none</proc></configuration></plugin></plugins></build>`),
    );

    expect([settings.release, settings.proc, settings.processorPaths]).toEqual([
      '1.8',
      'none',
      undefined,
    ]);
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
