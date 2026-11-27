import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isLombokGenerated, lombokAnnotationAt } from './lombok-generated.mts';

const SEMICOLON = '[UnnecessarySemicolon] Unnecessary semicolon';
const STATIC =
  '[MethodCanBeStatic] A private method that does not reference the enclosing instance can be static';
const FIELD_INIT = "[NullAway] @NonNull field 'name' not initialized";
const NULLABLE_ARGUMENT = "[NullAway] passing @Nullable parameter 'x' where @NonNull is required";

function at(text: string, marker: string, message: string): { position: number; message: string } {
  return { position: text.indexOf(marker), message };
}

function dropped(text: string, marker: string, message: string): boolean {
  return isLombokGenerated(at(text, marker, message), text);
}

describe('Lombok generated code', () => {
  it('leaves Error Prone checks to the runner, which drops what sits only on generated trees', () => {
    const text = [
      'import lombok.*;',
      '@Getter class Wild {',
      '  @SneakyThrows private int legacy() { return 1; }',
      '}',
    ].join('\n');
    expect([
      dropped(text, '@SneakyThrows', STATIC),
      dropped(text, '@Getter', SEMICOLON),
    ]).toStrictEqual([false, false]);
  });

  it('drops NullAway on passed or returned @Nullable values only at a Lombok annotation', () => {
    const text = 'import lombok.*;\n@Data\nclass A {\n  @Deprecated String name;\n}';
    const returned =
      '[NullAway] returning @Nullable expression from method with @NonNull return type';
    expect([
      dropped(text, '@Data', returned),
      dropped(text, '@Deprecated', NULLABLE_ARGUMENT),
    ]).toStrictEqual([true, false]);
  });

  it('keeps NullAway field initialization at @Data and drops NullAway on generated arguments', () => {
    const text = 'import lombok.*;\n@Data\nclass A {\n  String name;\n}';
    expect([
      dropped(text, '@Data', FIELD_INIT),
      dropped(text, '@Data', NULLABLE_ARGUMENT),
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
