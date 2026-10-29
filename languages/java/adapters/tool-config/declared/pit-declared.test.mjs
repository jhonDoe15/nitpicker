import { describe, expect, it } from 'vitest';
import { pitArguments, pitDeclarations, pitLayers } from './pit-declared.mjs';
import { readDeclaredBuild } from './declared-build.mjs';

function sourceOf(files) {
  return {
    paths: () => Object.keys(files),
    readMany: (wanted) =>
      new Map(wanted.filter((file) => file in files).map((file) => [file, files[file]])),
  };
}

const declarationsOf = (files) =>
  pitDeclarations(readDeclaredBuild(sourceOf(files))).map(({ setting, value, file }) => ({
    setting,
    value,
    file,
  }));

const GROOVY = `plugins { id 'java'; id 'info.solidsoft.pitest' version '1.15.0' }
pitest {
    mutators = ['STRONGER', '-NEGATE_CONDITIONALS']
    excludedMethods = ['toString', 'hashCode']
    timeoutConstInMillis = 10000
    threads = 4
    targetClasses = ['com.example.*']
}
`;
const KOTLIN = `pitest {
    excludedClasses.set(listOf("com.example.generated.*"))
    timeoutFactor.set(BigDecimal.valueOf(1.0))
    jvmArgs.set(listOf("-Xmx1g"))
}
`;
const POM = `<project><build><plugins><plugin>
  <groupId>org.pitest</groupId><artifactId>pitest-maven</artifactId>
  <configuration>
    <mutators><mutator>\${pit.extra}</mutator></mutators>
    <excludedClasses><param>com.example.Main</param></excludedClasses>
    <avoidCallsTo><avoidCallsTo>com.example.Audit</avoidCallsTo></avoidCallsTo>
    <timeoutConstant>8000</timeoutConstant>
    <argLine>-Dfile.encoding=UTF-8 @{argLine}</argLine>
    <features><feature>+auto_threads</feature></features>
  </configuration>
</plugin></plugins></build>
<properties><pit.extra>REMOVE_CONDITIONALS</pit.extra></properties>
</project>`;

describe('the PIT settings a build declares', () => {
  it('reads the pitest block of a Groovy and a Kotlin build', () => {
    expect(declarationsOf({ 'build.gradle': GROOVY, 'lib/build.gradle.kts': KOTLIN })).toEqual([
      { setting: 'mutators', value: ['STRONGER', '-NEGATE_CONDITIONALS'], file: 'build.gradle' },
      { setting: 'excludedMethods', value: ['toString', 'hashCode'], file: 'build.gradle' },
      { setting: 'timeoutConst', value: 10000, file: 'build.gradle' },
      { setting: 'threads', value: 4, file: 'build.gradle' },
      { setting: 'targetClasses', value: ['com.example.*'], file: 'build.gradle' },
      {
        setting: 'excludedClasses',
        value: ['com.example.generated.*'],
        file: 'lib/build.gradle.kts',
      },
      { setting: 'timeoutFactor', value: 1, file: 'lib/build.gradle.kts' },
      { setting: 'jvmArgs', value: ['-Xmx1g'], file: 'lib/build.gradle.kts' },
    ]);
  });

  it('reads pitest-maven with its properties resolved', () => {
    expect(declarationsOf({ 'pom.xml': POM })).toEqual([
      { setting: 'mutators', value: ['REMOVE_CONDITIONALS'], file: 'pom.xml' },
      { setting: 'timeoutConst', value: 8000, file: 'pom.xml' },
      { setting: 'jvmArgs', value: ['-Dfile.encoding=UTF-8', '@{argLine}'], file: 'pom.xml' },
      { setting: 'excludedClasses', value: ['com.example.Main'], file: 'pom.xml' },
      { setting: 'avoidCallsTo', value: ['com.example.Audit'], file: 'pom.xml' },
      { setting: 'features', value: ['+auto_threads'], file: 'pom.xml' },
    ]);
  });
});

describe('the PIT settings each precedence runs with', () => {
  const declarations = [
    { setting: 'mutators', value: ['STRONGER', '-NEGATE_CONDITIONALS'], file: 'build.gradle' },
    { setting: 'excludedMethods', value: ['toString'], file: 'build.gradle' },
    { setting: 'timeoutConst', value: 10000, file: 'build.gradle' },
    { setting: 'timeoutFactor', value: 1, file: 'build.gradle' },
    { setting: 'threads', value: 4, file: 'build.gradle' },
    { setting: 'targetClasses', value: ['com.example.*'], file: 'build.gradle' },
  ];
  const DEFAULTS =
    'INVERT_NEGS,MATH,VOID_METHOD_CALLS,NEGATE_CONDITIONALS,CONDITIONALS_BOUNDARY,INCREMENTS,TRUE_RETURNS,FALSE_RETURNS,PRIMITIVE_RETURNS,EMPTY_RETURNS,NULL_RETURNS';
  const logging =
    'java.util.logging,org.apache.log4j,org.apache.logging.log4j,org.slf4j,org.apache.commons.logging,org.jboss.logging';

  it('adds the project mutators and threads when the project wins, and its exclusions always', () => {
    expect(pitArguments(pitLayers(declarations, { projectWins: true }))).toEqual([
      ...['--threads', '4', '--timeoutConst', '10000', '--timeoutFactor', '1.25'],
      ...['--mutators', `${DEFAULTS},STRONGER`, '--excludedMethods', 'toString'],
      ...['--avoidCallsTo', logging],
    ]);
    expect(pitArguments(pitLayers(declarations, { projectWins: false }))).toEqual([
      ...['--threads', '2', '--timeoutConst', '10000', '--timeoutFactor', '1.25'],
      ...['--excludedMethods', 'toString'],
      ...['--avoidCallsTo', logging],
    ]);
  });

  it('lists what it leaves out: nitpicker-owned settings, removed mutators and lower timeouts', () => {
    const settingsOf = (projectWins) =>
      pitLayers(declarations, { projectWins }).notApplied.map(({ setting }) => setting);

    expect(settingsOf(true)).toEqual(['mutators', 'timeoutFactor', 'targetClasses']);
    expect(settingsOf(false)).toEqual(['mutators', 'timeoutFactor', 'threads', 'targetClasses']);
  });

  it('leaves out values with an unresolved property', () => {
    const layered = pitLayers(
      [{ setting: 'jvmArgs', value: ['-Xmx1g', '@{argLine}'], file: 'pom.xml' }],
      { projectWins: true },
    );

    expect(layered.lists.jvmArgs).toEqual(['-Xmx1g']);
    expect(layered.notApplied.map(({ file }) => file)).toEqual(['pom.xml']);
  });
});
