import { describe, expect, it } from 'vitest';
import { recipeProject } from '../../source/test-support/recipe-project.mts';
import { compatibilityShimRecipe as recipe } from '../forwarder-recipes.mts';
import {
  CALLER,
  CALLER_AFTER,
  CALLER_PATH,
  NAMES,
  NAMES_AFTER,
  NAMES_PATH,
  RULE,
  projectOf,
} from './test-support/shim-sources.mts';

const NOTE = `pmd/CompatibilityShim in ${NAMES_PATH}:9: left as is,`;

function declined(names: string, extra: Record<string, string> = {}) {
  const { result, read } = recipeProject({ files: projectOf(names, extra), rule: RULE });
  return {
    notes: result.notes,
    errors: result.toolErrors,
    names: read(NAMES_PATH),
    caller: read(CALLER_PATH),
  };
}

describe('compatibilityShimRecipe', () => {
  it('is a review recipe for pmd/CompatibilityShim in the Java preset', () => {
    expect([recipe.safety, recipe.scope, recipe.presets, recipe.rules]).toEqual([
      'review',
      'project',
      ['java'],
      [{ tool: 'pmd', rule: 'CompatibilityShim' }],
    ]);
  });

  it('moves the callers to the replacement and deletes the deprecated method', () => {
    const { result, read } = recipeProject({ files: projectOf(NAMES), rule: RULE });

    expect(result.toolErrors).toEqual([]);
    expect(result.fixedFindings).toEqual([
      `${NAMES_PATH}:9 pmd/CompatibilityShim (java-compatibility-shim)`,
    ]);
    expect(read(NAMES_PATH)).toBe(NAMES_AFTER);
    expect(read(CALLER_PATH)).toBe(CALLER_AFTER);
  });

  const OVERLOAD =
    '\n  static String format(String text, int width) {\n    return text;\n  }\n\n  static String format';
  it.each([
    {
      title: 'a public deprecated method, which callers outside the project may use',
      edit: (text: string) =>
        text.replace('  static String legacy', '  public static String legacy'),
      reason: 'it is public or protected, so callers outside the project may exist',
    },
    {
      title: 'a deprecated method that does more than forward',
      edit: (text: string) => text.replace('return format(text);', 'return format(text.strip());'),
      reason: 'it does more than pass its parameters on in order',
    },
    {
      title: 'a deprecated method whose replacement is overloaded',
      edit: (text: string) => text.replace('\n  static String format', OVERLOAD),
      reason: 'Names does not declare exactly one format',
    },
    {
      title: 'a deprecated instance method, whose callers cannot be told apart',
      edit: (text: string) => text.replace('static String legacy', 'String legacy'),
      reason: 'it is not a plain static method of the expected kind',
    },
  ])('leaves $title', ({ edit, reason }) => {
    const names = edit(NAMES);

    expect(declined(names)).toEqual({
      notes: [`${NOTE} ${reason}`],
      errors: [],
      names,
      caller: CALLER,
    });
  });

  it('leaves a deprecated field, which is not a forwarding method', () => {
    const field = '  @Deprecated\n  static final int LIMIT = 3;\n\n  static String format';
    const names = NAMES.replace('  static String format', field);

    expect(declined(names)).toEqual({
      notes: [
        'pmd/CompatibilityShim in src/main/java/shop/Names.java:8: left as is, the deprecated declaration is not a static method that only forwards to its replacement',
      ],
      errors: [],
      names: NAMES_AFTER.replace('  static String format', field),
      caller: CALLER_AFTER,
    });
  });

  it('leaves a deprecated method that Kotlin code calls', () => {
    const files = { 'src/main/kotlin/shop/Use.kt': 'fun use() = Names.legacy("a")\n' };

    expect(declined(NAMES, files)).toEqual({
      notes: [`${NOTE} src/main/kotlin/shop/Use.kt is not Java and mentions Names and legacy`],
      errors: [],
      names: NAMES,
      caller: CALLER,
    });
  });
});
