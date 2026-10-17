import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runJava } from '../maven-command.mjs';
import { chooseErrorProneJdk, featureVersion, jdkHomes } from './maven-jdk.mjs';

const VERSION_OUTPUT = (version) =>
  `openjdk version "${version}" 2024-01-16\nOpenJDK Runtime Environment`;
const jdk = (feature) => ({ java: `/jdk${String(feature)}/bin/java`, feature });
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fakeJdk(home) {
  mkdirSync(path.join(home, 'bin'), { recursive: true });
  writeFileSync(path.join(home, 'bin', 'java'), '');
  return home;
}

describe('the JDK Error Prone runs on', () => {
  it('reads the feature version of old and new version strings', () => {
    expect([
      featureVersion(VERSION_OUTPUT('1.8.0_392')),
      featureVersion(VERSION_OUTPUT('17.0.10')),
      featureVersion(VERSION_OUTPUT('21')),
      featureVersion('no version here'),
    ]).toStrictEqual([8, 17, 21, undefined]);
  });

  it("uses the project's JDK when it fits, else the closest installed JDK 21 or newer", () => {
    const installed = [jdk(25), jdk(17), jdk(21)];

    expect([
      chooseErrorProneJdk({ project: jdk(21), preview: false, installed }),
      chooseErrorProneJdk({ project: jdk(25), preview: false, installed: [] }),
      chooseErrorProneJdk({ project: jdk(17), preview: false, installed }),
      chooseErrorProneJdk({ project: jdk(17), preview: false, installed: [jdk(25)] }),
      chooseErrorProneJdk({ project: jdk(22), preview: true, installed }),
    ]).toStrictEqual([
      { java: '/jdk21/bin/java' },
      { java: '/jdk25/bin/java' },
      { java: '/jdk21/bin/java' },
      { java: '/jdk25/bin/java' },
      { java: '/jdk22/bin/java' },
    ]);
  });

  it('says where it looked when no JDK fits, and why preview needs the JDK itself', () => {
    expect([
      chooseErrorProneJdk({ project: jdk(17), preview: false, installed: [jdk(11)] }),
      chooseErrorProneJdk({ project: jdk(17), preview: true, installed: [jdk(21)] }),
    ]).toStrictEqual([
      {
        problem:
          "Error Prone needs at least JDK 21 (JDK 21 or newer, and at least the project's own JDK), and " +
          '/jdk17/bin/java is JDK 17. nitpicker found no such JDK in JAVA_HOME, the JAVA_HOME_<N>_X64 ' +
          'variables, ~/.m2/toolchains.xml, SDKMAN, /usr/lib/jvm or /Library/Java/JavaVirtualMachines. ' +
          'Install one there; the project keeps compiling for its own release',
      },
      {
        problem:
          'Error Prone needs JDK 21 or newer, and this project compiles with --enable-preview on JDK 17 ' +
          '(/jdk17/bin/java), whose preview features only that JDK compiles. Move the build to JDK 21 ' +
          'or newer, or drop --enable-preview',
      },
    ]);
  });

  it('finds JDKs in the versioned variables, toolchains.xml, SDKMAN and the system JDK directories', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'nitpicker-jdks-'));
    roots.push(home);
    const variable = fakeJdk(path.join(home, 'hosted', '21'));
    const toolchain = fakeJdk(path.join(home, 'toolchain-25'));
    const sdkman = fakeJdk(path.join(home, '.sdkman', 'candidates', 'java', '21.0.2-tem'));
    const mac = fakeJdk(path.join(home, 'jvms', 'temurin-21.jdk', 'Contents', 'Home'));
    mkdirSync(path.join(home, '.m2'));
    writeFileSync(
      path.join(home, '.m2', 'toolchains.xml'),
      `<toolchains><toolchain><type>jdk</type><configuration><jdkHome> ${toolchain} </jdkHome>` +
        '</configuration></toolchain></toolchains>',
    );

    expect(
      jdkHomes({
        env: { JAVA_HOME_21_X64: variable, JAVA_HOME: '/ignored', PATH: '/bin' },
        home,
        systemJdks: [path.join(home, 'jvms')],
      }),
    ).toStrictEqual([variable, toolchain, sdkman, mac]);
  });

  it('says java was not found instead of failing with a spawn error', () => {
    expect(() => runJava({ java: '/nowhere/bin/java', tool: 'Error Prone', args: [] })).toThrow(
      'java not found (/nowhere/bin/java): set JAVA_HOME to a JDK, or put its bin directory on the PATH',
    );
  });
});
