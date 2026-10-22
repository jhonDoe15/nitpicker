import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { errorProneMessage } from './messages.mjs';

const THROW_SUMMARY =
  'Base exception classes should be treated as abstract. Common alternatives include: AssertionError, ' +
  "IllegalArgumentException, IllegalStateException, and (Guava's) VerifyException.";
const THROW = {
  check: 'ThrowSpecificExceptions',
  summary: THROW_SUMMARY,
  suggestion: "Did you mean 'throw new VerifyException('?",
};

describe('errorProneMessage', () => {
  it('tells the reader to use a checked result, without suggesting ways to ignore it', () => {
    const suggestion =
      "Did you mean '@CanIgnoreReturnValue public int count() {' or 'verify(count());' or " +
      "'var unused = count();' or to remove this line?";

    expect(
      errorProneMessage({
        check: 'CheckReturnValue',
        summary: 'The result of `count()` must be used',
        suggestion,
      }),
    ).toBe(
      'The result of `count()` must be used. Use the result, or make the method return void if callers do not ' +
        'need it. Did you mean to remove this line?',
    );
  });

  it('keeps Guava suggestions when Guava is on the classpath and gives the JDK forms when it is not', () => {
    expect(errorProneMessage(THROW, { guava: true })).toBe(
      `${THROW_SUMMARY} Did you mean 'throw new VerifyException('?`,
    );
    expect(errorProneMessage(THROW, { guava: false })).toBe(
      'Base exception classes should be treated as abstract. Common alternatives include: AssertionError, ' +
        "IllegalArgumentException and IllegalStateException. Did you mean 'throw new IllegalStateException('?",
    );
  });

  it('rewrites Guava collections to the JDK factories and drops Guava-only alternatives without Guava', () => {
    const doubleBrace = {
      check: 'DoubleBraceInitialization',
      summary:
        'Prefer collection factory methods or builders to the double-brace initialization pattern.',
      suggestion:
        "Did you mean 'return new HashMap<>(ImmutableMap.of(' or 'Preconditions.checkNotNull(x);'?",
    };
    const array = {
      check: 'MutablePublicArray',
      summary:
        'This array can be modified by clients. Prefer an ImmutableList, or provide an accessor method.',
    };

    expect(errorProneMessage(doubleBrace, { guava: false })).toBe(
      "Prefer collection factory methods or builders to the double-brace initialization pattern. Did you mean 'return new HashMap<>(Map.of('?",
    );
    expect(errorProneMessage(array, { guava: false })).toBe(
      'This array can be modified by clients. Prefer an unmodifiable List (List.of), or provide an accessor method.',
    );
  });

  it('never prints a suggestion made only of punctuation', () => {
    const tag = { check: 'EmptyBlockTag', summary: 'A block tag has an empty description.' };

    expect(errorProneMessage({ ...tag, suggestion: "Did you mean '*'?" })).toBe(tag.summary);
    expect(errorProneMessage({ ...tag, suggestion: "Did you mean '{' or 'x();'?" })).toBe(
      "A block tag has an empty description. Did you mean 'x();'?",
    );
  });

  it('explains the default charset and time zone the way the fix should go', () => {
    expect(
      errorProneMessage({
        check: 'DefaultCharset',
        summary:
          'Implicit use of the platform default charset, which can result in differing behaviour.',
        suggestion: "Did you mean 'out.toString(UTF_8);'?",
      }),
    ).toBe(
      "Implicit use of the default charset: what this reads or writes depends on the runtime's settings and on the " +
        "JDK version (JDK 18 made UTF-8 the default). Pass the charset explicitly. Did you mean 'out.toString(UTF_8);'?",
    );
    expect(
      errorProneMessage({
        check: 'JavaTimeDefaultTimeZone',
        summary:
          'LocalDate.now() is not allowed because it silently uses the system default time-zone. ' +
          'You must pass an explicit time-zone (e.g., ZoneId.of("America/Los_Angeles")) to this method.',
        suggestion: "Did you mean 'LocalDate.now(ZoneId.systemDefault());'?",
      }),
    ).toBe(
      'LocalDate.now() is not allowed because it silently uses the system default time-zone. Inject a Clock ' +
        '(or a ZoneId) and pass it, as in LocalDate.now(clock), so the zone is explicit and tests can fix the time.',
    );
  });
});

describe('the Java skill', () => {
  it('gives the null form the NullAway message gives', () => {
    const skill = readFileSync(
      path.resolve(import.meta.dirname, '../../../../skills/nitpicker-java/SKILL.md'),
      'utf8',
    );
    const nullRule = /^- Null:[\s\S]*?(?=\n- |\n\n)/mu.exec(skill)?.[0].replaceAll(/\s+/gu, ' ');
    const message = errorProneMessage({ check: 'NullAway', summary: 'returning @Nullable' });
    const forms = ['@Nullable', 'org.jspecify.annotations.Nullable', 'checked before use'];

    expect(forms.map((form) => [form, nullRule?.includes(form)])).toStrictEqual(
      forms.map((form) => [form, true]),
    );
    expect(message).toBe(
      'returning @Nullable. Annotate what may be null with the @Nullable the project already uses ' +
        "(JSpecify's org.jspecify.annotations.Nullable if it uses none) and check it before use; " +
        'otherwise give it a non-null value.',
    );
  });
});
