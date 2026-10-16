import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readForbiddenApiFindings } from '../forbidden-apis.mjs';
import { guardProject, newLines, removeGuardProjects } from '../test-support/guard-project.mjs';

const LEGACY_DATE =
  'ERROR: Forbidden class/interface use: java.util.Date [legacy-date-time: Use java.time.]';

function declarations(className, members) {
  return members
    .flatMap((member) => [
      LEGACY_DATE,
      `ERROR:   in demo.${className} (Audit.java, method declaration of '${member}')`,
    ])
    .join('\n');
}

function auditFindings(source, report) {
  const root = guardProject({
    'src/main/java/demo/Audit.java': source.join('\n'),
    'reports/forbidden-apis.txt': report,
  });
  return readForbiddenApiFindings(path.join(root, 'reports'), {
    locate: (packageDirectory, fileName) => `src/main/java/${packageDirectory}/${fileName}`,
    projectRoot: root,
  });
}

const LEGACY_LOG = ['  void log(Date when, String message) {', '  }'];

describe('forbiddenapis declarations of a banned type', () => {
  afterEach(() => {
    removeGuardProjects();
  });

  it('places each overload on its own declaration and reports the added one as new', () => {
    const base = auditFindings(
      ['package demo;', 'public class Audit {', ...LEGACY_LOG, '}'],
      declarations('Audit', ['log(java.util.Date,java.lang.String)']),
    );
    const head = auditFindings(
      [
        'package demo;',
        'public class Audit {',
        ...LEGACY_LOG,
        '  void log(final @Nonnull String message, Date when) {',
        '  }',
        '}',
      ],
      declarations('Audit', [
        'log(java.util.Date,java.lang.String)',
        'log(java.lang.String,java.util.Date)',
      ]),
    );

    expect(head.map((finding) => finding.location.line)).toEqual([3, 5]);
    expect(newLines(base, head)).toEqual([['src/main/java/demo/Audit.java', 5]]);
  });

  it('places a method of a nested class inside that class, not on the same name outside it', () => {
    const findings = auditFindings(
      [
        'package demo;',
        'public class Audit {',
        '  void log(Date when) {',
        '  }',
        '  static class Builder {',
        '    Builder log(Date when) {',
        '      return this;',
        '    }',
        '  }',
        '}',
      ],
      [
        declarations('Audit$Builder', ['log(java.util.Date)']),
        declarations('Audit', ['log(java.util.Date)']),
      ].join('\n'),
    );

    expect(findings.map((finding) => finding.location.line)).toEqual([6, 3]);
  });

  it('places a method behind an annotation with an array value on its own line', () => {
    const findings = auditFindings(
      [
        'package demo;',
        'public final class Audit {',
        '  @SuppressWarnings({"unchecked", "rawtypes"})',
        '  @Deprecated(since = "1", forRemoval = true)',
        '  public Date lastSeen() {',
        '    return null;',
        '  }',
        '}',
      ],
      declarations('Audit', ['lastSeen()']),
    );

    expect(findings.map((finding) => finding.location.line)).toEqual([5]);
  });

  it('keeps two declarations it cannot place, though both go on the class line', () => {
    const findings = auditFindings(
      ['package demo;', '@Generated', 'public class Audit {', '}'],
      declarations('Audit', ['first(java.util.Date)', 'second(java.util.Date)']),
    );

    expect(findings.map((finding) => finding.location.line)).toEqual([3, 3]);
  });
});

describe('forbiddenapis signatures', () => {
  const SIGNATURES = readFileSync(
    path.join(import.meta.dirname, '../../gradle/rules/forbidden-apis.txt'),
    'utf8',
  );

  function groups() {
    const messages = new Map();
    let message;
    for (const line of SIGNATURES.split('\n').filter((text) => /^[@\w]/.test(text))) {
      message = /^@defaultMessage (.+)$/.exec(line)?.[1] ?? message;
      if (!line.startsWith('@')) {
        messages.set(line, message);
      }
    }
    return messages;
  }

  it('states each rule message once and keeps it for the signatures after @ignoreUnresolvable', () => {
    const tags = [...SIGNATURES.matchAll(/^@defaultMessage ([a-z-]+):/gm)].map((match) => match[1]);
    const unresolvable = SIGNATURES.split('@ignoreUnresolvable')[1]
      .split('\n')
      .filter((line) => /^\w/.test(line));
    const messages = groups();

    expect(new Set(tags).size).toBe(tags.length);
    expect(unresolvable).toEqual([
      'java.lang.Thread#startVirtualThread(java.lang.Runnable)',
      'java.lang.Thread$Builder#start(java.lang.Runnable)',
    ]);
    expect([
      ...new Set(
        ['java.lang.Thread#start()', ...unresolvable].map((signature) => messages.get(signature)),
      ),
    ]).toEqual([expect.stringMatching(/^new-thread: /)]);
  });
});
