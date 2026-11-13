import { describe, expect, it } from 'vitest';
import { readDeclaredBuild } from './declared-build.mjs';
import { declaredToolNotices } from './declared-choices.mjs';
import { TESTS, testRetryDeclarations, testRetryValues } from './test-retries-declared.mjs';

function sourceOf(files) {
  return {
    paths: () => Object.keys(files),
    readMany: (wanted) =>
      new Map(wanted.filter((file) => file in files).map((file) => [file, files[file]])),
  };
}

const buildOf = (files) => readDeclaredBuild(sourceOf(files));
const declarationsOf = (files) =>
  testRetryDeclarations(buildOf(files)).map(({ setting, value, file, conditional }) => ({
    setting,
    value,
    file,
    ...(conditional === true ? { conditional } : {}),
  }));

const GROOVY = `plugins { id 'java'; id 'org.gradle.test-retry' version '1.6.0' }
test { retry { maxRetries = 3; failOnPassedAfterRetry = true } }
`;
const KOTLIN = `develocity { testRetry { maxRetries.set(2) } }
test { retry { maxRetries = findProperty("retries") as Int } }
`;
const POM = `<project><build><plugins>
<plugin><artifactId>maven-surefire-plugin</artifactId>
<configuration><rerunFailingTestsCount>2</rerunFailingTestsCount></configuration></plugin>
<plugin><artifactId>maven-failsafe-plugin</artifactId>
<configuration><rerunFailingTestsCount>\${failsafe.retries}</rerunFailingTestsCount></configuration></plugin>
</plugins></build>
<properties><failsafe.retries>4</failsafe.retries>
<surefire.rerunFailingTestsCount>1</surefire.rerunFailingTestsCount></properties>
</project>`;

describe('the test retries a build declares', () => {
  it('reads maxRetries of the test-retry plugin and of Develocity', () => {
    expect(declarationsOf({ 'build.gradle': GROOVY })).toEqual([
      { setting: 'maxRetries', value: 3, file: 'build.gradle' },
    ]);
    expect(declarationsOf({ 'build.gradle.kts': KOTLIN })).toEqual([
      { setting: 'maxRetries', value: 2, file: 'build.gradle.kts' },
      { setting: 'maxRetries', value: undefined, file: 'build.gradle.kts' },
    ]);
  });

  it('reads rerunFailingTestsCount of surefire and failsafe, and their properties', () => {
    expect(declarationsOf({ 'pom.xml': POM })).toEqual([
      { setting: 'surefire.rerunFailingTestsCount', value: 2, file: 'pom.xml' },
      { setting: 'failsafe.rerunFailingTestsCount', value: 4, file: 'pom.xml' },
      { setting: 'surefire.rerunFailingTestsCount', value: 1, file: 'pom.xml' },
    ]);
  });

  it('takes the highest value per setting and skips what it cannot read or what is conditional', () => {
    const declarations = declarationsOf({ 'build.gradle.kts': KOTLIN, 'pom.xml': POM });

    expect(testRetryValues(declarations)).toEqual({
      maxRetries: 2,
      'surefire.rerunFailingTestsCount': 2,
      'failsafe.rerunFailingTestsCount': 4,
    });
    expect(
      testRetryValues([
        { setting: 'maxRetries', value: 5, conditional: true, file: 'build.gradle' },
      ]),
    ).toEqual({});
  });

  it('rejects a count above 10', () => {
    expect(() =>
      testRetryValues([{ setting: 'maxRetries', value: 11, file: 'build.gradle' }]),
    ).toThrow('maxRetries in build.gradle is 11: it must be a whole number from 0 to 10');
  });

  it.each([
    [['project'], { maxRetries: 3 }],
    [['project', 'nitpicker'], { maxRetries: 3 }],
    [['nitpicker', 'project'], {}],
  ])('lets the ordering %j decide whether the values apply', (precedence, expected) => {
    const layers = { usesProject: true, nitpickerFirst: precedence[0] === 'nitpicker' };

    expect(TESTS.choice(buildOf({ 'build.gradle': GROOVY }), { layers }).arguments).toEqual(
      expected,
    );
  });

  it('is a tool error to name the project without a retry in the build', () => {
    expect(() =>
      TESTS.choice(buildOf({ 'build.gradle': "plugins { id 'java' }" }), {
        layers: { usesProject: true, nitpickerFirst: false },
      }),
    ).toThrow('"tools.tests.precedence" lists "project" but test retries in the build');
  });

  it('says what it ignored without the opt-in, only for a retry above zero', () => {
    const source = sourceOf({ 'build.gradle': GROOVY });

    expect(declaredToolNotices({}, source)).toEqual([
      'Ignoring the test retry settings in build.gradle; opt in with "tools": { "tests": { "precedence": ["project", "nitpicker"] } }',
    ]);
    expect(
      declaredToolNotices({}, sourceOf({ 'build.gradle': 'test { retry { maxRetries = 0 } }' })),
    ).toEqual([]);
  });
});
