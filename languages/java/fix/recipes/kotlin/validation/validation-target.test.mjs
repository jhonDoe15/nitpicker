import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mjs';
import { validationTargetRecipe } from './validation-target.mjs';

const HEAD = [
  'import jakarta.validation.constraints.NotBlank',
  'import jakarta.validation.constraints.Size',
  'import jakarta.validation.Valid',
  '',
].join('\n');
const fix = (text) =>
  applyRecipe(validationTargetRecipe, `${HEAD}${text}\n`).slice(HEAD.length, -1);

describe('validationTargetRecipe', () => {
  it('writes @field: on constructor properties', () => {
    expect(
      fix('data class A(@NotBlank val name: String, @Size(max = 3) @Valid val tags: List<B>)'),
    ).toBe(
      'data class A(@field:NotBlank val name: String, @field:Size(max = 3) @field:Valid val tags: List<B>)',
    );
  });
  it('handles annotations on their own lines and qualified names', () => {
    expect(
      fix('class A(\n    @jakarta.validation.constraints.Email\n    val mail: String,\n)'),
    ).toBe('class A(\n    @field:jakarta.validation.constraints.Email\n    val mail: String,\n)');
    expect(
      plannedLines(validationTargetRecipe, `${HEAD}class A(\n    @NotBlank val a: String,\n)\n`),
    ).toEqual([5]);
  });
  it.each([
    'class A(@field:NotBlank val a: String)',
    'class A(@get:NotBlank val a: String)',
    'class A(@param:NotBlank val a: String)',
    'class A(@NotBlank a: String)',
    'class A(@Deprecated val a: String)',
    'class A(@NotBlank @field:NotBlank val a: String)',
    'class A { @NotBlank val a: String = "" }',
    'class A(val a: List<@NotBlank String>)',
  ])(
    'leaves visible targets, plain parameters, other annotations and body properties alone (%s)',
    (text) => {
      expect(fix(text)).toBe(text);
    },
  );
  it('needs an explicit import of the annotation', () => {
    const text = 'import jakarta.validation.constraints.*\nclass A(@NotBlank val a: String)\n';

    expect(applyRecipe(validationTargetRecipe, text)).toBe(text);
  });
  it('leaves test sources alone', () => {
    const text = `${HEAD}class A(@NotBlank val a: String)\n`;

    expect(applyRecipe(validationTargetRecipe, text, 'src/test/kotlin/A.kt')).toBe(text);
  });
});
