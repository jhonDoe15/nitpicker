import { describe, expect, it } from 'vitest';
import { INLINE_SUPPRESSION_RULE, fileFindings } from '../java-suppressions.mts';
import { callUntyped, findingsOf } from '../../typed/java-values.mts';
import { textOf } from '../../../../../shared/values/readers.mts';
import { exceptionRoute } from '../../../../../shared/exceptions/rule-names.mjs';
import { ERROR_PRONE_MESSAGE } from './errorprone-escapes.mts';

const ROUTE = textOf(
  callUntyped(exceptionRoute, { rule: 'errorprone/InlineSuppression', path: 'A.java' }),
);

function found(source: string): unknown[][] {
  return findingsOf(callUntyped(fileFindings, source, 'A.java')).map((finding) => [
    finding.tool,
    finding.rule,
    finding.location?.line,
    finding.message,
  ]);
}

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
        INLINE_SUPPRESSION_RULE,
        2,
        `${ERROR_PRONE_MESSAGE} Found: @NullUnmarked. ${ROUTE}`,
      ],
      [
        'errorprone',
        INLINE_SUPPRESSION_RULE,
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
        ['errorprone', INLINE_SUPPRESSION_RULE, 3, message],
        ['errorprone', INLINE_SUPPRESSION_RULE, 4, message],
      ],
      [],
    ]);
  });
});
