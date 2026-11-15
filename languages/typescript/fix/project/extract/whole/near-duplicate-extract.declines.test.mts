import { describe, expect, it } from 'vitest';
import { useFixtureProjects } from '../../test-support/fixture-project.mts';
import { built, copy, loader, pair, twoMethods, typed } from '../test-support/sources.mts';
import { nearDuplicateExtractRecipe as recipe } from './near-duplicate-extract.mts';

const projects = useFixtureProjects();

function outcome(files: Record<string, string>): { source: string | undefined; notes: string[] } {
  const result = projects.fix(files, { recipe, rule: 'structure/near-duplicate' });
  return { source: result.tree['src/a.ts'], notes: result.notes };
}

function writing(name: string, prefix: string, value: string): string {
  return copy(name, { prefix })
    .replace('const selected', 'limit = limit + 1;\n  const selected')
    .replace(`'${prefix}'`, value);
}

function enclosed() {
  const methods = twoMethods((body) => body.replace("'none:'", 'outer')).replace('export ', '');
  const lines = methods.replaceAll(/^/gmu, '  ');
  return `{\n  const outer = 'none:';\n  void [outer];\n${lines}}\n`;
}

function commented() {
  const noted = copy('alignBottom', { prefix: 'bottom:' }).replace(
    '  const label',
    '  // keep the order\n  const label',
  );
  return `${copy('alignTop')}\n${noted}`;
}

function templated() {
  return pair().replaceAll("'none:'", `\`none\n  \${limit}:\``);
}

function endingWithComment() {
  const noted = copy('alignBottom', { prefix: 'bottom:' }).replace(
    /\}\n$/u,
    '  // keep in sync with the server\n}\n',
  );
  return `${copy('alignTop')}\n${noted}`;
}

function moduleLoad(name: string, path: string): string {
  return loader(name, `require('${path}')`);
}

function described(name: string, type: string): string {
  return `export function ${name}(limit: ${type}, items: string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (out.length < items.length) {
      out.push(item + limit.toString());
    }
  }
  out.reverse();
  return out;
}
`;
}

function note(line: number, reason: string): string[] {
  return [`--fix left src/a.ts:${String(line)} near-duplicate: ${reason}`];
}
const requireDeclaration = 'declare function require(path: string): (id: string) => string;\n';
const several = 'a copy belongs to more than one pair of near-duplicates';

describe('nearDuplicateExtractRecipe declines', () => {
  it('leaves copies in different files alone', () => {
    const files = {
      'src/a.ts': copy('alignTop'),
      'src/b.ts': copy('alignBottom', { prefix: 'bottom:' }),
    };
    const result = projects.fix(files, { recipe, rule: 'structure/near-duplicate' });
    expect([result.tree['src/a.ts'], result.tree['src/b.ts'], result.notes]).toEqual([
      files['src/a.ts'],
      files['src/b.ts'],
      [],
    ]);
  });

  it.each([
    [
      'a generic type that differs in its name',
      `${typed('topLists', 'Array<string>')}\n${typed('topSets', 'Set<string>')}`,
      note(12, 'the copies use different types'),
    ],
    [
      'a qualified type name',
      `declare namespace Shapes { type Round = string; type Flat = string }\n${typed('topRound', 'Shapes.Round')}\n${typed('topFlat', 'Shapes.Flat')}`,
      note(2, 'the copies use different types'),
    ],
    [
      'a body that needs members of the differing type',
      `${typed('topStrings', 'string', { guard: ' && item.length > 0' })}\n${typed('topBytes', 'Uint8Array', { guard: ' && item.length > 0' })}`,
      note(1, 'the change would add errors to src/a.ts'),
    ],
    [
      'a member read on a value of the differing type',
      `${described('describeText', 'string')}\n${described('describeCount', 'number')}`,
      note(1, 'the change would add errors to src/a.ts'),
    ],
    [
      'a constructor that differs',
      `class Foo { constructor(readonly value: string) {} }\nclass Bar { constructor(readonly value: string) {} }\n${built('buildFoos', 'Foo')}\n${built('buildBars', 'Bar')}`,
      note(3, 'the copies differ in a part that is not a plain value'),
    ],
    [
      'name collision',
      `${pair()}\nexport const sharedAlignTop = 1;\n`,
      note(1, 'the name of the shared function would collide'),
    ],
    [
      'this in a method',
      twoMethods((body) => body.replace('< limit', '< this.limit')),
      note(2, 'the code uses this, super, JSX, decorators or a generator'),
    ],
    [
      'a written parameter',
      `${writing('alignTop', 'top:', 'String(limit)')}\n${writing('alignBottom', 'bottom:', "'b'")}`,
      note(1, 'a differing value reads a variable the copied code writes'),
    ],
    [
      'an enclosing scope',
      enclosed(),
      note(5, 'the code reads arguments or a variable of an enclosing scope'),
    ],
    [
      'a comment',
      commented(),
      note(1, 'the second copy has comments the shared function would drop'),
    ],
    [
      'a comment before the closing brace',
      endingWithComment(),
      note(1, 'the second copy has comments the shared function would drop'),
    ],
    [
      'a template literal that spans lines',
      templated(),
      note(1, 'the code has a string or template literal that spans lines'),
    ],
    [
      'three copies',
      `${pair()}\n${copy('alignLeft', { prefix: 'left:' })}`,
      [...note(15, several), ...note(1, several)],
    ],
    [
      'a module path',
      `${requireDeclaration}${moduleLoad('first', './a.js')}\n${moduleLoad('second', './b.js')}`,
      note(9, 'the copies differ in a part that is not a plain value'),
    ],
  ])('leaves the source untouched for %s', (_name, source, notes) => {
    expect(outcome({ 'src/a.ts': source })).toEqual({ source, notes });
  });

  it('leaves JavaScript copies that construct different classes alone', () => {
    const plain = (name: string, constructor: string) =>
      built(name, constructor)
        .replace('items: string[], limit: number): object[]', 'items, limit)')
        .replace('picked: object[]', 'picked');
    const source = `class Foo { constructor(value) { this.value = value; } }\nclass Bar { constructor(value) { this.value = value; } }\n${plain('buildFoos', 'Foo')}\n${plain('buildBars', 'Bar')}`;
    const result = projects.fix(
      { 'src/a.js': source },
      { recipe, rule: 'structure/near-duplicate' },
    );
    expect([result.tree['src/a.js'], result.notes]).toEqual([
      source,
      [
        '--fix left src/a.js:3 near-duplicate: the copies differ in a part that is not a plain value',
      ],
    ]);
  });
});
