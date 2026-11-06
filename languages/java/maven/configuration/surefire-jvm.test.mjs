import { describe, expect, it } from 'vitest';
import { childAt, parseXml } from '../../../../shared/ingest/common.mjs';
import { argLineTokens, testJvmArguments } from './surefire-jvm.mjs';

function argumentsOf({ properties = '', plugin = '', execution }) {
  const project = parseXml(
    `<project><properties>${properties}</properties><build><plugins><plugin>` +
      `<artifactId>maven-surefire-plugin</artifactId>${plugin}` +
      `<executions><execution><id>default-test</id>${execution ?? ''}</execution></executions>` +
      '</plugin></plugins></build></project>',
  );
  const surefire = childAt(project, 'build', 'plugins', 'plugin');
  return testJvmArguments(project, surefire, childAt(surefire, 'executions', 'execution'));
}

const configuration = (body) => `<configuration>${body}</configuration>`;

describe('argLineTokens', () => {
  it('splits on whitespace and keeps a quoted value whole without its quotes', () => {
    expect([
      argLineTokens(' -Xmx1g\n\t--add-opens  java.base/java.lang=ALL-UNNAMED '),
      argLineTokens(`-Dg="hello world" '-Dh=it "is"' -Dq="it's" "" -Dl=a,b`),
      argLineTokens('-Dopen="no end'),
      argLineTokens(''),
    ]).toEqual([
      ['-Xmx1g', '--add-opens', 'java.base/java.lang=ALL-UNNAMED'],
      ['-Dg=hello world', '-Dh=it "is"', "-Dq=it's", '-Dl=a,b'],
      ['-Dopen=no end'],
      [],
    ]);
  });
});

describe('testJvmArguments', () => {
  it('reads the argLine of the default-test execution, else of the plugin, else the argLine property', () => {
    const plugin = configuration('<argLine>-Dfrom=plugin</argLine>');
    const execution = configuration('<argLine>-Dfrom=execution</argLine>');
    const properties = '<argLine>-Dfrom=property</argLine>';

    expect([
      argumentsOf({ properties, plugin, execution }),
      argumentsOf({ properties, plugin }),
      argumentsOf({ properties }),
      argumentsOf({}),
    ]).toEqual([['-Dfrom=execution'], ['-Dfrom=plugin'], ['-Dfrom=property'], []]);
  });

  it('fills a late @{...} reference from the POM properties and drops each argument it cannot resolve', () => {
    const argLine = (line) => configuration(`<argLine>${line}</argLine>`);

    expect([
      argumentsOf({ plugin: argLine('@{argLine} -XX:+AllowRedefinitionToAddDeleteMethods') }),
      argumentsOf({
        properties: '<argLine/><opens>--add-opens java.base/java.lang=ALL-UNNAMED</opens>',
        plugin: argLine('@{argLine} @{opens} -Dx=@{missing}/tmp -Dkept=1'),
      }),
      argumentsOf({
        plugin: argLine(
          '-Dfile=${project.build.directory}/x -javaagent:${settings.localRepository}/a.jar ' +
            '-Dnested=${a:${b}} "-Dq=${quoted} value" -Xmx1g',
        ),
      }),
    ]).toEqual([
      ['-XX:+AllowRedefinitionToAddDeleteMethods'],
      ['--add-opens', 'java.base/java.lang=ALL-UNNAMED', '-Dkept=1'],
      ['-Xmx1g'],
    ]);
  });

  it('adds systemProperties and then systemPropertyVariables as -D arguments after the argLine', () => {
    const plugin = configuration(
      '<argLine>-Dorder=argLine</argLine>' +
        '<systemProperties><property><name>legacy</name><value>a,b</value></property>' +
        '<flat>x</flat><property><name>empty</name></property></systemProperties>',
    );
    const execution = configuration(
      '<systemPropertyVariables><order>variables</order><quote>say &quot;hi&quot;</quote>' +
        '<blank/><dir>${unresolved}/x</dir></systemPropertyVariables>',
    );

    expect(argumentsOf({ plugin, execution })).toEqual([
      '-Dorder=argLine',
      '-Dlegacy=a,b',
      '-Dflat=x',
      '-Dempty=',
      '-Dorder=variables',
      '-Dquote=say "hi"',
      '-Dblank=',
    ]);
  });
});
