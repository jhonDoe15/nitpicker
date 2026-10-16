import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isLombokGenerated, lombokAnnotationAt } from './lombok-generated.mjs';

const SEMICOLON = '[UnnecessarySemicolon] Unnecessary semicolon';
const STATIC =
  '[MethodCanBeStatic] A private method that does not reference the enclosing instance can be static';
const FIELD_INIT = "[NullAway] @NonNull field 'name' not initialized";
const NULLABLE_ARGUMENT = "[NullAway] passing @Nullable parameter 'x' where @NonNull is required";

const at = (text, marker, message) => ({ position: text.indexOf(marker), message });
const dropped = (text, marker, message) => isLombokGenerated(at(text, marker, message), text);

describe('Lombok generated code', () => {
  it('keeps every finding on a method whose annotation is not Lombok, under import lombok.*', () => {
    const text = [
      'import lombok.*;',
      '@Getter class Wild {',
      '  @Deprecated private int legacy() { return 1; }',
      '  @Override public String toString() { return "w"; }',
      '}',
    ].join('\n');
    expect([
      dropped(text, '@Deprecated', STATIC),
      dropped(text, '@Deprecated', SEMICOLON),
      dropped(text, '@Override', SEMICOLON),
      dropped(text, '@Getter', SEMICOLON),
    ]).toStrictEqual([false, false, false, true]);
  });

  it('keeps a declaration finding that starts at a Lombok annotation', () => {
    const text =
      'import lombok.SneakyThrows;\nclass A {\n  @SneakyThrows private int helper() { return 2; }\n}';
    expect(dropped(text, '@SneakyThrows', STATIC)).toBe(false);
  });

  it('drops a check that only reaches a Lombok annotation through the code Lombok generates there', () => {
    const text = 'import lombok.Data;\n@Data\nclass A {\n  @lombok.Builder.Default int b = 1;\n}';
    expect([
      dropped(text, '@Data', SEMICOLON),
      dropped(text, '@lombok.Builder', SEMICOLON),
    ]).toStrictEqual([true, true]);
  });

  it('keeps NullAway field initialization at @Data and drops NullAway on generated arguments', () => {
    const text = 'import lombok.*;\n@Data\nclass A {\n  String name;\n}';
    expect([
      dropped(text, '@Data', FIELD_INIT),
      dropped(text, '@Data', NULLABLE_ARGUMENT),
    ]).toStrictEqual([false, true]);
  });

  it('keeps a utility class finding at a logger annotation and drops it at @FieldNameConstants', () => {
    const text = [
      'import lombok.experimental.FieldNameConstants;',
      'import lombok.extern.slf4j.Slf4j;',
      '@Slf4j class Util { static int one() { return 1; } }',
      '@FieldNameConstants class Named { int a; }',
    ].join('\n');
    const utility =
      '[PrivateConstructorForUtilityClass] Classes which are not intended to be instantiated';
    expect([
      dropped(text, '@Slf4j', utility),
      dropped(text, '@FieldNameConstants', utility),
    ]).toStrictEqual([false, true]);
  });

  it('resolves names through the imports, a single-type import shadowing lombok.*', () => {
    const text = 'import lombok.*;\nimport com.example.Data;\n@Data class A {}\n@Value class B {}';
    expect([
      lombokAnnotationAt(text, text.indexOf('@Data')),
      lombokAnnotationAt(text, text.indexOf('@Value')),
    ]).toStrictEqual([undefined, 'lombok.Value']);
  });

  it('lets a type of the same file or package shadow lombok.*, as javac does', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-lombok-names-'));
    try {
      writeFileSync(
        path.join(directory, 'Value.java'),
        'package demo;\npublic @interface Value {}\n',
      );
      const file = path.join(directory, 'A.java');
      const text = 'import lombok.*;\n@interface Data {}\n@Data @Value @Getter class A {}';
      expect(
        ['@Data', '@Value', '@Getter'].map((name) =>
          lombokAnnotationAt(text, text.indexOf(`${name} `), file),
        ),
      ).toStrictEqual([undefined, undefined, 'lombok.Getter']);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('ignores a Lombok name in a comment and a diagnostic without a position', () => {
    const text = 'import lombok.Data;\n/**\n * @Data is used below\n */\n@Data class A {}';
    const tag = "[UnrecognisedJavadocTag] This Javadoc tag wasn't recognised";
    expect([
      dropped(text, '@Data is', tag),
      isLombokGenerated({ position: -1, message: SEMICOLON }, text),
      isLombokGenerated({ message: SEMICOLON }, text),
    ]).toStrictEqual([false, false, false]);
  });
});
