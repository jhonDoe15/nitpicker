import { describe, expect, it } from 'vitest';
import { errorProneJdkProblem, featureVersion } from './maven-jdk.mjs';

const VERSION_OUTPUT = (version) =>
  `openjdk version "${version}" 2024-01-16\nOpenJDK Runtime Environment`;

describe('the JDK Error Prone runs on', () => {
  it('reads the feature version of old and new version strings', () => {
    expect([
      featureVersion(VERSION_OUTPUT('1.8.0_392')),
      featureVersion(VERSION_OUTPUT('17.0.10')),
      featureVersion(VERSION_OUTPUT('21')),
      featureVersion('no version here'),
    ]).toStrictEqual([8, 17, 21, undefined]);
  });

  it('accepts JDK 21 and newer, and says what to change for an older or unreadable one', () => {
    const advice =
      'Point JAVA_HOME at a JDK 21 or newer (Maven and nitpicker both use it); ' +
      'the project keeps compiling for its own release';

    expect([
      errorProneJdkProblem('/jdk21/bin/java', VERSION_OUTPUT('21.0.2')),
      errorProneJdkProblem('/jdk25/bin/java', VERSION_OUTPUT('25')),
      errorProneJdkProblem('/jdk17/bin/java', VERSION_OUTPUT('17.0.10')),
      errorProneJdkProblem('java', ''),
    ]).toStrictEqual([
      undefined,
      undefined,
      `Error Prone needs JDK 21 or newer, and /jdk17/bin/java is JDK 17. ${advice}`,
      `Error Prone needs JDK 21 or newer, and java is a JDK whose version nitpicker could not read. ${advice}`,
    ]);
  });
});
