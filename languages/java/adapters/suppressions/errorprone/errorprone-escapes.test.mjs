import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fileFindings } from '../java-suppressions.mjs';
import { exceptionRoute } from '../../../../../shared/exceptions/rule-names.mjs';
import { ERROR_PRONE_MESSAGE } from './errorprone-escapes.mjs';

const ROUTE = exceptionRoute({ rule: 'errorprone/InlineSuppression', path: 'A.java' });

const found = (source) =>
  fileFindings(source, 'A.java').map((finding) => [
    finding.tool,
    finding.rule,
    finding.location.line,
    finding.message,
  ]);

describe('Error Prone escapes that are annotations', () => {
  it('reports @NullUnmarked, simple or qualified, which turns NullAway off for the code under it', () => {
    const source = [
      'import org.jspecify.annotations.NullUnmarked;',
      '@NullUnmarked',
      'class A {',
      '  @org.jspecify.annotations.NullUnmarked String a() { return null; }',
      '  // @NullUnmarked in a comment',
      '  String b() { return "@NullUnmarked"; }',
      '}',
    ].join('\n');

    expect(found(source)).toEqual([
      [
        'errorprone',
        'InlineSuppression',
        2,
        `${ERROR_PRONE_MESSAGE} Found: @NullUnmarked. ${ROUTE}`,
      ],
      [
        'errorprone',
        'InlineSuppression',
        4,
        `${ERROR_PRONE_MESSAGE} Found: @NullUnmarked. ${ROUTE}`,
      ],
    ]);
  });

  it("reports a @CanIgnoreReturnValue the project declares, and not Error Prone's own", () => {
    const own = [
      'package demo;',
      'class A {',
      '  @CanIgnoreReturnValue A add() { return this; }',
      '  @demo.CanIgnoreReturnValue A put() { return this; }',
      '}',
    ].join('\n');
    const errorPrones = [
      'import com.google.errorprone.annotations.CanIgnoreReturnValue;',
      'class A {',
      '  @CanIgnoreReturnValue A add() { return this; }',
      '  @com.google.errorprone.annotations.CanIgnoreReturnValue A put() { return this; }',
      '}',
    ].join('\n');
    const message = `${ERROR_PRONE_MESSAGE} Found: @CanIgnoreReturnValue declared by the project. ${ROUTE}`;

    expect([found(own), found(errorPrones)]).toEqual([
      [
        ['errorprone', 'InlineSuppression', 3, message],
        ['errorprone', 'InlineSuppression', 4, message],
      ],
      [],
    ]);
  });
});

describe('an Error Prone check name in @SuppressWarnings', () => {
  const CHECKS = JSON.parse(
    readFileSync(new URL('../../../gradle/errorprone/checks.json', import.meta.url), 'utf8'),
  );
  const suppressedBy = (name) =>
    fileFindings(`class A {\n  @SuppressWarnings("${name}") void a() {}\n}\n`, 'A.java').map(
      ({ tool }) => tool,
    );

  it('is reported for every check Error Prone runs, so the suppression cannot hide its finding', () => {
    expect(CHECKS.suppressible.filter((name) => suppressedBy(name).length !== 1)).toEqual([]);
  });

  it('is reported for UnusedMethod, which runs, and hides nothing for UnusedVariable, which is off', () => {
    expect({
      method: suppressedBy('UnusedMethod'),
      variable: suppressedBy('UnusedVariable'),
      variableOff: CHECKS.disable.includes('UnusedVariable'),
    }).toEqual({ method: ['errorprone'], variable: [], variableOff: true });
  });
});
