import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { chooseDetektJdk, noFittingJdk, skipWithoutJdk, structureJava } from './maven-jdk.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function reportDirectory() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-skip-'));
  roots.push(root);
  return root;
}

const oldJava = () => ({ stderr: 'openjdk version "17.0.9" 2023-10-17', stdout: '', status: 0 });

describe('a Maven tool that finds no JDK to run on', () => {
  it('is skipped, leaving the reason and an empty report', () => {
    const reportDir = reportDirectory();

    skipWithoutJdk(
      { reportDir, file: 'errorprone-skipped.txt', placeholders: { 'errorprone.json': '[]\n' } },
      () => {
        throw noFittingJdk('Error Prone needs JDK 21 or newer. Install one');
      },
    );

    expect(readFileSync(path.join(reportDir, 'errorprone-skipped.txt'), 'utf8')).toEqual(
      'Error Prone needs JDK 21 or newer. Install one\n',
    );
    expect(readFileSync(path.join(reportDir, 'errorprone.json'), 'utf8')).toEqual('[]\n');
  });

  it('still fails on any other error', () => {
    expect(() => {
      skipWithoutJdk({ reportDir: reportDirectory(), file: 'x.txt' }, () => {
        throw new Error('the tool crashed');
      });
    }).toThrow('the tool crashed');
  });

  it('is not skipped when the JDK fits the sources', () => {
    expect(structureJava({ level: 17, spawn: oldJava }).feature).toBe(17);
  });

  it('skips the structure metrics when no JDK reads the sources', () => {
    expect(() => structureJava({ level: 25, spawn: oldJava })).toThrow(
      /its sources are Java 25.*JDK 17/u,
    );
  });
});

describe('the JDK detekt runs on', () => {
  const jdk = (feature) => ({ java: `/jdk${String(feature)}/bin/java`, feature });

  it('is the JDK Maven runs on when detekt starts there', () => {
    expect(chooseDetektJdk({ project: jdk(21), installed: [jdk(17)] })).toEqual({
      java: '/jdk21/bin/java',
    });
  });

  it('is the newest installed JDK up to 21 when Maven runs on a newer one', () => {
    expect(
      chooseDetektJdk({ project: jdk(25), installed: [jdk(25), jdk(17), jdk(21), jdk(11)] }),
    ).toEqual({ java: '/jdk21/bin/java' });
  });

  it('names what to install when Maven runs on JDK 25 and no JDK 17 to 21 is there', () => {
    const { problem } = chooseDetektJdk({ project: jdk(25), installed: [jdk(25), jdk(11)] });

    expect(problem).toBe(
      'detekt runs on JDK 17 to 21 only, and Maven runs on JDK 25 (/jdk25/bin/java). ' +
        'nitpicker found no such JDK in JAVA_HOME, the JAVA_HOME_<N>_X64 variables, ' +
        '~/.m2/toolchains.xml, SDKMAN, /usr/lib/jvm or /Library/Java/JavaVirtualMachines. ' +
        "Install one there; detekt still resolves JDK types against the project's own JDK",
    );
  });
});
