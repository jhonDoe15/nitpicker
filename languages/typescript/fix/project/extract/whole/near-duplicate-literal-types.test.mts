import { describe, expect, it } from 'vitest';
import { useFixtureProjects } from '../../test-support/fixture-project.mts';
import { nearDuplicateExtractRecipe as recipe } from './near-duplicate-extract.mts';

const projects = useFixtureProjects();

const WIDENED =
  'the literal values did not type-check as a union, so the shared function takes their base type';
const SHAPE = "type Shape = { kind: 'circle' | 'square' | 'triangle'; size: number };\n";

function fix(source: string) {
  const result = projects.fix({ 'src/a.ts': source }, { recipe, rule: 'structure/near-duplicate' });
  return { source: result.tree['src/a.ts'] ?? '', notes: result.notes };
}

function counter(name: string, kind: string): string {
  return `export function ${name}(shapes: Shape[], limit: number): number {
  const picked = shapes.filter((shape) => shape.kind === ${kind} && shape.size < limit);
  const total = picked.reduce((sum, shape) => sum + shape.size, 0);
  const output = total > limit ? limit : total;
  return output * picked.length;
}
`;
}

function joiner(name: string, mark: string, count: string): string {
  return `export function ${name}(names: string[], limit: number): string {
  const kept = names.filter((entry) => entry.length < limit).slice(0, ${count});
  const label = kept.map((entry) => entry.trim()).join(${mark});
  const output = label.length > 0 ? label : 'none';
  return output.padEnd(limit, '-');
}
`;
}

function relabeled(name: string, start: string): string {
  return `export function ${name}(names: string[], limit: number): string {
  const kept = names.filter((entry) => entry.length < limit);
  const marks = [${start}];
  marks.push(kept.map((entry) => entry.trim()).join(','));
  return marks.join('').padEnd(limit, '-');
}
`;
}

function signatureOf(source: string): string | undefined {
  return /^function shared\w*\(.*$/mu.exec(source)?.[0];
}

describe('nearDuplicateExtractRecipe literal parameter types', () => {
  it('types a compared literal with the union of the literals the copies pass', () => {
    const { source, notes } = fix(
      `${SHAPE}\n${counter('countCircles', "'circle'")}\n${counter('countSquares', "'square'")}`,
    );

    expect(signatureOf(source)).toBe(
      "function sharedCountCircles(shapes: Shape[], limit: number, value: 'circle' | 'square'): number {",
    );
    expect(source).toContain("return sharedCountCircles(shapes, limit, 'square');");
    expect(notes).toEqual([]);
  });

  it('keeps the union when the literal goes to a parameter typed string or number', () => {
    const { source, notes } = fix(
      `${joiner('joinDash', "'-'", '3')}\n${joiner('joinPlus', "'+'", '5')}`,
    );

    expect(signatureOf(source)).toBe(
      "function sharedJoinDash(names: string[], limit: number, value: 3 | 5, valueValue: '-' | '+'): string {",
    );
    expect(notes).toEqual([]);
  });

  it('falls back to the base type with a note when the union does not compile', () => {
    const { source, notes } = fix(
      `${relabeled('labelTop', "'top:'")}\n${relabeled('labelBottom', "'bottom:'")}`,
    );

    expect(signatureOf(source)).toBe(
      'function sharedLabelTop(names: string[], limit: number, value: string): string {',
    );
    expect(notes).toEqual([
      `--fix applied src/a.ts:1 structure/near-duplicate (${recipe.id}): ${WIDENED}`,
    ]);
  });
});
