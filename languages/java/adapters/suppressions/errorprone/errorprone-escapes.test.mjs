import { describe, expect, it } from 'vitest';
import { fileFindings } from '../java-suppressions.mjs';
import { ERROR_PRONE_MESSAGE } from './errorprone-escapes.mjs';

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
      ['errorprone', 'InlineSuppression', 2, `${ERROR_PRONE_MESSAGE} Found: @NullUnmarked.`],
      ['errorprone', 'InlineSuppression', 4, `${ERROR_PRONE_MESSAGE} Found: @NullUnmarked.`],
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
    const message = `${ERROR_PRONE_MESSAGE} Found: @CanIgnoreReturnValue declared by the project.`;

    expect([found(own), found(errorPrones)]).toEqual([
      [
        ['errorprone', 'InlineSuppression', 3, message],
        ['errorprone', 'InlineSuppression', 4, message],
      ],
      [],
    ]);
  });
});
