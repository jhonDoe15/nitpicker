import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { gradleToolEnvironment, gradleWorkerArguments, memoryAdvice } from './gradle-memory.mts';

const GIB = 1024 ** 3;
const roots: string[] = [];

function build(properties?: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-memory-'));
  roots.push(root);
  writeFileSync(path.join(root, 'settings.gradle'), '');
  if (properties !== undefined) {
    writeFileSync(path.join(root, 'gradle.properties'), properties);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('gradleWorkerArguments', () => {
  const userHome = { GRADLE_USER_HOME: '/nonexistent-gradle-home' };

  it('lowers the Gradle workers to the tool slots only when memory, not the CPUs, limits them', () => {
    expect(gradleWorkerArguments(build(), { slots: 2, cpus: 8 }, userHome)).toEqual([
      '--max-workers=2',
    ]);
    expect(gradleWorkerArguments(build(), { slots: 4, cpus: 4 }, userHome)).toEqual([]);
  });

  it('keeps a lower worker count the build sets itself', () => {
    const root = build('org.gradle.workers.max=1\n');

    expect(gradleWorkerArguments(root, { slots: 3, cpus: 8 }, userHome)).toEqual([
      '--max-workers=1',
    ]);
    expect(
      gradleWorkerArguments(build('org.gradle.workers.max=6\n'), { slots: 3, cpus: 8 }, userHome),
    ).toEqual(['--max-workers=3']);
  });
});

describe('gradleToolEnvironment', () => {
  it('gives every JVM without a heap of its own a share of the tool memory, keeping other options', () => {
    expect(
      gradleToolEnvironment({ PATH: '/bin', JDK_JAVA_OPTIONS: '-Dfile.encoding=UTF-8' }, 4),
    ).toEqual({
      PATH: '/bin',
      JDK_JAVA_OPTIONS: '-XX:MaxRAMPercentage=18.8 -Dfile.encoding=UTF-8',
    });
  });

  it('leaves a heap the user set in JDK_JAVA_OPTIONS alone', () => {
    expect(gradleToolEnvironment({ JDK_JAVA_OPTIONS: '-Xmx2g' }, 4)['JDK_JAVA_OPTIONS']).toBe(
      '-Xmx2g',
    );
  });
});

describe('memoryAdvice', () => {
  it('names the machine memory and the tool JVMs when the daemon was killed or ran out of memory', () => {
    const killed =
      'Gradle build daemon disappeared unexpectedly (it may have been killed or may have crashed)';

    expect(memoryAdvice(killed, 4, 15 * GIB)).toBe(
      '\nThe Gradle daemon or one of its JVMs ran out of memory on a machine with 15.0 GB, where nitpicker ' +
        'runs 4 tool JVMs at once next to the daemon: lower the daemon heap (-Xmx in org.gradle.jvmargs) or ' +
        'org.gradle.workers.max in gradle.properties, or run on a larger machine.',
    );
    expect(memoryAdvice('java.lang.OutOfMemoryError: Java heap space', 1, 2 * GIB)).toContain(
      'runs 1 tool JVM at',
    );
    expect(memoryAdvice('error: cannot find symbol', 4, GIB)).toBe('');
  });
});
