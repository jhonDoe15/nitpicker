import { describe, expect, it } from 'vitest';
import { useFixtureProjects } from '../../test-support/fixture-project.mjs';
import { copy, loader, pair, twoMethods } from '../test-support/sources.mjs';
import { nearDuplicateExtractRecipe as recipe } from './near-duplicate-extract.mjs';

const projects = useFixtureProjects();

function outcome(files) {
  const result = projects.fix(files, { recipe, rule: 'structure/near-duplicate' });
  return { source: result.tree['src/a.ts'], notes: result.notes };
}

function writing(name, prefix, value) {
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

function moduleLoad(name, path) {
  return loader(name, `require('${path}')`);
}

const note = (line, reason) => [`--fix left src/a.ts:${line} near-duplicate: ${reason}`];
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
});
