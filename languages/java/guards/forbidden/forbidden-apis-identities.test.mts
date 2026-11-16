import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readForbiddenApiFindings } from '../forbidden-apis.mts';
import { createGuardProjects, javaClass, newLines } from '../test-support/guard-project.mts';

const guardProjects = createGuardProjects();

describe('forbiddenapis identities and declaration lines', () => {
  afterEach(() => {
    guardProjects.remove();
  });

  const SLEEP =
    'ERROR: Forbidden method invocation: java.lang.Thread#sleep(**) [thread-sleep: Do not sleep.]';
  const PAUSE = javaClass('class Pause {', [
    'void a() { Thread.sleep(1); }',
    'void b() { Thread.sleep(2); }',
  ]);
  const PAUSE_ADDED = javaClass('class Pause {', [
    'void c() { Thread.sleep(3); }',
    'void a() { Thread.sleep(1); }',
    'void b() { Thread.sleep(2); }',
  ]);
  const EXPIRY: readonly [string, string] = ['expiry(java.util.Date)', '  Date expiry(Date at) {'];
  const CONSTRUCTOR: readonly [string, string] = ['<init>(java.util.Date)', '  Held(Date at) {'];

  function forbiddenFindings(files: Readonly<Record<string, string>>) {
    const root = guardProjects.project(files);
    return readForbiddenApiFindings(path.join(root, 'reports'), {
      locate: (packageDirectory, fileName) => `src/main/java/${packageDirectory}/${fileName}`,
      projectRoot: root,
    });
  }

  function sleeps(className: string, lines: readonly number[]) {
    return lines.flatMap((line) => [
      SLEEP,
      `ERROR:   in ${className} (Pause.java:${String(line)})`,
    ]);
  }

  it('keeps the forbiddenapis uses of a class moved to another package', () => {
    const base = forbiddenFindings({
      'src/main/java/demo/Pause.java': PAUSE,
      'reports/forbidden-apis.txt': sleeps('demo.Pause', [3, 4]).join('\n'),
    });
    const head = forbiddenFindings({
      'src/main/java/moved/Pause.java': PAUSE.replace('package demo;', 'package moved;'),
      'reports/forbidden-apis.txt': sleeps('moved.Pause', [3, 4]).join('\n'),
    });

    expect(
      newLines(
        base,
        head,
        new Map([['src/main/java/demo/Pause.java', 'src/main/java/moved/Pause.java']]),
      ),
    ).toEqual([]);
  });

  it('reports the forbiddenapis use of an added line, not of a legacy line', () => {
    const base = forbiddenFindings({
      'src/main/java/demo/Pause.java': PAUSE,
      'reports/forbidden-apis.txt': sleeps('demo.Pause', [3, 4]).join('\n'),
    });
    const head = forbiddenFindings({
      'src/main/java/demo/Pause.java': PAUSE_ADDED,
      'reports/forbidden-apis.txt': sleeps('demo.Pause', [3, 4, 5]).join('\n'),
    });

    expect(newLines(base, head)).toEqual([['src/main/java/demo/Pause.java', 3]]);
  });

  it.each<[string, string, readonly [string, string]]>([
    ['a call returned', '    return expiry(new Date(1));', EXPIRY],
    ['a constructor call', '    Held held = new Held(new Date(1));', CONSTRUCTOR],
    ['a thrown exception', '    throw new Held(new Date(1));', CONSTRUCTOR],
  ])(
    'skips %s and places the declaration on the line that declares it',
    (_, use, [member, declaration]) => {
      const findings = forbiddenFindings({
        'src/main/java/demo/Held.java': [
          'package demo;',
          'class Held extends RuntimeException {',
          '  Object first() {',
          use,
          '  }',
          declaration,
          '    return at;',
          '  }',
          '}',
          '',
        ].join('\n'),
        'reports/forbidden-apis.txt': [
          'ERROR: Forbidden class/interface use: java.util.Date [legacy-date-time: Use java.time.]',
          `ERROR:   in demo.Held (Held.java, method declaration of '${member}')`,
        ].join('\n'),
      });

      expect(findings.map((finding) => finding.location?.line)).toEqual([6]);
    },
  );
});
