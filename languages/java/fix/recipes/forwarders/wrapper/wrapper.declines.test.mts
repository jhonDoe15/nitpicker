import { describe, expect, it } from 'vitest';
import { recipeProject } from '../../source/test-support/recipe-project.mts';
import {
  FACADE,
  FACADE_PATH,
  REPORT,
  REPORT_PATH,
  RULE,
  STRINGS,
  STRINGS_PATH,
  projectOf,
} from './test-support/wrapper-sources.mts';

const NOTE = `pmd/StaticForwardingWrapper in ${FACADE_PATH}:7: left as is,`;

function declined(files: Record<string, string>) {
  const { result, read } = recipeProject({ files, rule: RULE });
  return { notes: result.notes, errors: result.toolErrors, facade: read(FACADE_PATH) };
}

describe('staticForwardingWrapperRecipe declines', () => {
  it('leaves a public wrapper, which callers outside the project may use', () => {
    const facade = FACADE.replace('  static String trim', '  public static String trim');

    expect(declined(projectOf({ [FACADE_PATH]: facade }))).toEqual({
      notes: [`${NOTE} it is public or protected, so callers outside the project may exist`],
      errors: [],
      facade,
    });
  });

  it('leaves a wrapper whose target is overloaded', () => {
    const strings = STRINGS.replace(
      '}\n}\n',
      '}\n\n  public static String trim(String text, int limit) {\n    return text.strip();\n  }\n}\n',
    );

    expect(declined(projectOf({ [STRINGS_PATH]: strings }))).toEqual({
      notes: [`${NOTE} Strings does not declare exactly one trim`],
      errors: [],
      facade: FACADE,
    });
  });

  it('leaves a wrapper whose target returns another type', () => {
    const strings = STRINGS.replace('public static String trim', 'public static CharSequence trim');

    expect(declined(projectOf({ [STRINGS_PATH]: strings }))).toEqual({
      notes: [`${NOTE} the target has another return type or parameter list`],
      errors: [],
      facade: FACADE,
    });
  });

  it('leaves a wrapper whose target is outside the project', () => {
    const facade = FACADE.replace('Strings.trim(text)', 'Math.abs(text)').replace(
      'import shop.util.Strings;\n\n',
      '',
    );

    expect(declined(projectOf({ [FACADE_PATH]: facade }))).toEqual({
      notes: [
        `pmd/StaticForwardingWrapper in ${FACADE_PATH}:5: left as is, Math is not a class of this project`,
      ],
      errors: [],
      facade,
    });
  });

  it('leaves a wrapper that something may call by its name as a string', () => {
    const report = REPORT.replace('return "["', 'String.valueOf("trim");\n    return "["');

    expect(declined(projectOf({ [REPORT_PATH]: report }))).toEqual({
      notes: [`${NOTE} ${REPORT_PATH} has the string "trim", which may name the method`],
      errors: [],
      facade: FACADE,
    });
  });

  it('leaves a wrapper when a value of unknown type is asked for the same name', () => {
    const report = REPORT.replace('raw.trim()', 'make().trim()');

    expect(declined(projectOf({ [REPORT_PATH]: report }))).toEqual({
      notes: [`${NOTE} ${REPORT_PATH} calls trim on a value that may be a Facade`],
      errors: [],
      facade: FACADE,
    });
  });

  it('leaves a wrapper that a method reference uses', () => {
    const report = REPORT.replace(
      'Facade.trim(text)',
      'java.util.Optional.of(text).map(Facade::trim)',
    );

    expect(declined(projectOf({ [REPORT_PATH]: report }))).toEqual({
      notes: [`${NOTE} ${REPORT_PATH} uses trim as a method reference`],
      errors: [],
      facade: FACADE,
    });
  });

  it('leaves a wrapper that Kotlin code calls', () => {
    const files = projectOf({ 'src/main/kotlin/shop/Use.kt': 'fun use() = Facade.trim(" a ")\n' });

    expect(declined(files)).toEqual({
      notes: [`${NOTE} src/main/kotlin/shop/Use.kt is not Java and mentions Facade and trim`],
      errors: [],
      facade: FACADE,
    });
  });

  it('leaves a method that adds work to the call it forwards', () => {
    const facade = FACADE.replace('Strings.trim(text)', 'Strings.trim(text.toLowerCase())');

    expect(declined(projectOf({ [FACADE_PATH]: facade }))).toEqual({
      notes: [],
      errors: [],
      facade,
    });
  });

  it('leaves a static method of an interface, which is public without saying so', () => {
    const facade = `package shop;

import shop.util.Strings;

interface Facade {
  static String trim(String text) {
    return Strings.trim(text);
  }
}
`;

    expect(declined(projectOf({ [FACADE_PATH]: facade }))).toEqual({
      notes: [
        `pmd/StaticForwardingWrapper in ${FACADE_PATH}:6: left as is, it is public or protected, so callers outside the project may exist`,
      ],
      errors: [],
      facade,
    });
  });

  it('leaves a wrapper that shares its line with another declaration', () => {
    const facade = FACADE.replace('  }\n\n  String run', '  } int other;\n\n  String run');

    expect(declined(projectOf({ [FACADE_PATH]: facade }))).toEqual({
      notes: [`${NOTE} another declaration shares a line with it`],
      errors: [],
      facade,
    });
  });

  it('leaves a wrapper whose type of the same name is another class than the target takes', () => {
    const item = 'package shop;\n\npublic final class Item {}\n';
    const other = 'package shop.util;\n\npublic final class Item {}\n';
    const strings = STRINGS.replaceAll('String', 'Item').replace('text.strip()', 'text');
    const facade = FACADE.replaceAll('String', 'Item')
      .replace('" a "', 'null')
      .replace('" b "', 'null');

    expect(
      declined({
        [STRINGS_PATH]: strings,
        [FACADE_PATH]: facade,
        'src/main/java/shop/Item.java': item,
        'src/main/java/shop/util/Item.java': other,
      }),
    ).toEqual({
      notes: [`${NOTE} the target has another return type or parameter list`],
      errors: [],
      facade,
    });
  });
});
