import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { parseForbiddenApiUses, readForbiddenApiFindings } from './forbidden-apis.mjs';
import {
  guardProject,
  javaClass,
  newLines,
  removeGuardProjects,
} from './test-support/guard-project.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const METHOD = 'Forbidden method invocation';
const REPORT = [
  'Picked up JAVA_TOOL_OPTIONS: -Dx=y',
  'Reading API signatures: /gradle/rules/forbidden-apis.txt',
  'Scanning classes for violations...',
  'ERROR: Forbidden class/interface use: java.util.Date ' +
    '[legacy-date-time: Use java.time instead of the legacy date classes.]',
  'ERROR:   in demo.Legacy (Legacy.java:11)',
  `ERROR: ${METHOD}: java.lang.Thread#sleep(**) [thread-sleep: Do not sleep in production code.]`,
  'ERROR:   in demo.Legacy$Worker (Legacy.java:15)',
  `ERROR: ${METHOD}: java.lang.Thread#<init>(**) [new-thread: Do not start threads by hand.]`,
  'ERROR:   in demo.Legacy (Legacy.java:16)',
  `ERROR: ${METHOD}: java.lang.Thread#sleep(**) [thread-sleep: Do not sleep in production code.]`,
  'ERROR:   in demo.Legacy$Worker (Legacy.java:30)',
  `ERROR: ${METHOD}: java.lang.Runtime#exec(java.lang.String, java.lang.String[]) ` +
    '[runtime-exec: Run commands with ProcessBuilder.]',
  'ERROR:   in gen.Generated (Generated.java:2)',
  'ERROR: Scanned 3 class file(s) for forbidden API invocations (in 0.17s), 5 error(s).',
  'ERROR: Check for forbidden API calls failed, see log.',
  '',
].join('\n');

function project() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-forbidden-'));
  roots.push(root);
  mkdirSync(path.join(root, 'build/nitpicker'), { recursive: true });
  mkdirSync(path.join(root, 'src/main/java/demo'), { recursive: true });
  writeFileSync(path.join(root, 'build/nitpicker/forbidden-apis.txt'), REPORT);
  return root;
}

const locate = (packageDirectory, fileName) =>
  packageDirectory === 'demo' ? `src/main/java/demo/${fileName}` : undefined;

describe('parseForbiddenApiUses', () => {
  it('pairs each violation with the class and line that follows it', () => {
    const use = (signature, rule, text, className, fileName, line) => ({
      signature,
      rule,
      text,
      className,
      fileName,
      line,
    });
    const sleep = [
      'java.lang.Thread#sleep(**)',
      'thread-sleep',
      'Do not sleep in production code.',
    ];

    expect(parseForbiddenApiUses(REPORT)).toEqual([
      use(
        'java.util.Date',
        'legacy-date-time',
        'Use java.time instead of the legacy date classes.',
        'demo.Legacy',
        'Legacy.java',
        11,
      ),
      use(...sleep, 'demo.Legacy$Worker', 'Legacy.java', 15),
      use(
        'java.lang.Thread#<init>(**)',
        'new-thread',
        'Do not start threads by hand.',
        'demo.Legacy',
        'Legacy.java',
        16,
      ),
      use(...sleep, 'demo.Legacy$Worker', 'Legacy.java', 30),
      use(
        'java.lang.Runtime#exec(java.lang.String, java.lang.String[])',
        'runtime-exec',
        'Run commands with ProcessBuilder.',
        'gen.Generated',
        'Generated.java',
        2,
      ),
    ]);
  });
});

describe('readForbiddenApiFindings', () => {
  it('reports each use as an enforceable finding named by its rule tag', () => {
    const root = project();

    const findings = readForbiddenApiFindings(path.join(root, 'build/nitpicker'), {
      locate,
      projectRoot: root,
    });

    expect(findings.map(({ rule, path: file, location }) => [rule, file, location.line])).toEqual([
      ['legacy-date-time', 'src/main/java/demo/Legacy.java', 11],
      ['thread-sleep', 'src/main/java/demo/Legacy.java', 15],
      ['new-thread', 'src/main/java/demo/Legacy.java', 16],
      ['thread-sleep', 'src/main/java/demo/Legacy.java', 30],
    ]);
    expect(findings.map(({ tool, classification }) => [tool, classification])).toEqual(
      findings.map(() => ['forbiddenapis', 'enforceable']),
    );
    expect(findings.map(({ message }) => message)).toEqual([
      'Use java.time instead of the legacy date classes. Found: Date. ' +
        'If it is right here, add an exception for forbiddenapis/legacy-date-time in nitpicker.config.json.',
      'Do not sleep in production code. Found: Thread.sleep. ' +
        'If it is right here, add an exception for forbiddenapis/thread-sleep in nitpicker.config.json.',
      'Do not start threads by hand. Found: new Thread. ' +
        'If it is right here, add an exception for forbiddenapis/new-thread in nitpicker.config.json.',
      'Do not sleep in production code. Found: Thread.sleep. ' +
        'If it is right here, add an exception for forbiddenapis/thread-sleep in nitpicker.config.json.',
    ]);
    expect(() => parseAnalyzerReport({ findings }, 'java')).not.toThrow();
  });

  it('numbers repeats of the same use in a class and ignores a missing report', () => {
    const root = project();

    const findings = readForbiddenApiFindings(path.join(root, 'build/nitpicker'), {
      locate,
      projectRoot: root,
    });

    expect(findings[3].identity).toBe(`${findings[1].identity}#2`);
    expect(
      readForbiddenApiFindings(path.join(root, 'nothing'), { locate, projectRoot: root }),
    ).toEqual([]);
  });

  it('places a field, method, class or record declaration of a banned type on its source line', () => {
    const root = project();
    const banned =
      'ERROR: Forbidden class/interface use: java.util.Date [legacy-date-time: Use java.time.]';
    const declarations = [
      "Decl$Source (Decl.java, method declaration of 'next()')",
      'Decl$Stamp (Decl.java, class declaration)',
      'Decl$Stamp (Decl.java:22)',
      "Decl$Event (Decl.java, record component declaration of 'at')",
      "Decl$Event (Decl.java, field declaration of 'at')",
      "Decl$Event (Decl.java, method declaration of '<init>(java.util.Date)')",
      "Decl$Event (Decl.java, method declaration of 'at()')",
      "Decl (Decl.java, field declaration of 'created')",
      "Decl (Decl.java, method declaration of '<init>(java.util.Date)')",
      "Decl (Decl.java, method declaration of 'created()')",
      "Decl (Decl.java, method declaration of 'take(int,java.util.Date)')",
      "Decl (Decl.java, method declaration of 'lambda$take$0(java.util.Date)')",
    ];
    writeFileSync(
      path.join(root, 'build/nitpicker/forbidden-apis.txt'),
      declarations.flatMap((place) => [banned, `ERROR:   in demo.${place}`]).join('\n'),
    );
    writeFileSync(
      path.join(root, 'src/main/java/demo/Decl.java'),
      [
        'package demo;',
        '',
        'import java.util.Date;',
        '',
        'public class Decl {',
        '  private Date created;',
        '',
        '  public Decl(Date start) {',
        '    Date copy = created();',
        '    this.created = start;',
        '  }',
        '',
        '  Date created() {',
        '    return created;',
        '  }',
        '',
        '  void take(String a) {}',
        '',
        '  void take(int a,',
        '      Date b) {}',
        '',
        '  static class Stamp extends Date {}',
        '',
        '  interface Source {',
        '    Date next();',
        '  }',
        '',
        '  record Event(Date at) {}',
        '}',
      ].join('\n'),
    );

    const findings = readForbiddenApiFindings(path.join(root, 'build/nitpicker'), {
      locate,
      projectRoot: root,
    });

    expect(findings.map(({ rule, location }) => [rule, location.line])).toEqual(
      [25, 22, 28, 6, 8, 13, 19].map((line) => ['legacy-date-time', line]),
    );
    expect(new Set(findings.map((finding) => finding.identity)).size).toBe(findings.length);
  });

  it('keeps the identity of a declaration when the class gains other uses', () => {
    const root = project();
    const banned =
      'ERROR: Forbidden class/interface use: java.util.Date [legacy-date-time: Use java.time.]';
    const read = (places) => {
      writeFileSync(
        path.join(root, 'build/nitpicker/forbidden-apis.txt'),
        places.flatMap((place) => [banned, `ERROR:   in demo.Held (Held.java${place})`]).join('\n'),
      );
      return readForbiddenApiFindings(path.join(root, 'build/nitpicker'), {
        locate,
        projectRoot: root,
      }).map((finding) => finding.identity);
    };
    writeFileSync(
      path.join(root, 'src/main/java/demo/Held.java'),
      'class Held {\n  private Date at;\n  long millis() {\n    return new Date().getTime();\n  }\n}\n',
    );

    const [field] = read([", field declaration of 'at'"]);

    expect(read([':4', ", field declaration of 'at'"])).toEqual([expect.any(String), field]);
  });

  it('skips a Date another API returns that the same statement converts with toInstant()', () => {
    const root = project();
    const legacyDate = (line) => [
      'ERROR: Forbidden class/interface use: java.util.Date [legacy-date-time: Use java.time.]',
      `ERROR:   in demo.Expiry (Expiry.java:${String(line)})`,
    ];
    writeFileSync(
      path.join(root, 'build/nitpicker/forbidden-apis.txt'),
      [3, 7, 8, 10, 11].flatMap((line) => legacyDate(line)).join('\n'),
    );
    writeFileSync(
      path.join(root, 'src/main/java/demo/Expiry.java'),
      [
        'class Expiry {',
        '  Instant notAfter(X509Certificate certificate) {',
        '    return certificate.getNotAfter().toInstant();',
        '  }',
        '  Instant chained(X509Certificate certificate) {',
        '    return certificate',
        '        .getNotAfter()',
        '        .toInstant();',
        '  }',
        '  Instant held(X509Certificate certificate) { Date date = certificate.getNotAfter();',
        '    return new Date().toInstant(); }',
        '}',
      ].join('\n'),
    );

    const findings = readForbiddenApiFindings(path.join(root, 'build/nitpicker'), {
      locate,
      projectRoot: root,
    });

    expect(findings.map(({ rule, location }) => [rule, location.line])).toEqual([
      ['legacy-date-time', 10],
      ['legacy-date-time', 11],
    ]);
  });
});

describe('forbiddenapis identities and declaration lines', () => {
  afterEach(() => {
    removeGuardProjects();
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
  const EXPIRY = ['expiry(java.util.Date)', '  Date expiry(Date at) {'];
  const CONSTRUCTOR = ['<init>(java.util.Date)', '  Held(Date at) {'];

  function forbiddenFindings(files) {
    const root = guardProject(files);
    return readForbiddenApiFindings(path.join(root, 'reports'), {
      locate: (packageDirectory, fileName) => `src/main/java/${packageDirectory}/${fileName}`,
      projectRoot: root,
    });
  }

  function sleeps(className, lines) {
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

  it.each([
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

      expect(findings.map((finding) => finding.location.line)).toEqual([6]);
    },
  );
});
