import { describe, expect, it } from 'vitest';
import { parseXml } from '../../ingest/common.mjs';
import { compilerSettings } from './compiler-settings.mjs';
import { pluginsOf } from './pom-elements.mjs';

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
