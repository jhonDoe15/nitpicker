import { describe, expect, it } from 'vitest';
import { byId, factsOfFiles } from '../../test-support/project.mjs';

function idsOf(files, policy) {
  return factsOfFiles(files, policy).callables.map(({ id }) => id);
}

const CALLBACKS = [
  '[1].forEach(() => {});\n',
  '[2].forEach((value) => value);\n',
  '[3].map((value) => value);\n',
].join('');

describe('the ids of callbacks and static members', () => {
  it('numbers the callbacks of a file by name, without a position', () => {
    expect(idsOf({ 'src/a.ts': CALLBACKS })).toEqual([
      'src/a.ts#forEach@1',
      'src/a.ts#forEach@2',
      'src/a.ts#map@1',
    ]);
  });

  it('keeps the ids of callbacks when lines are inserted above them', () => {
    expect(
      idsOf({ 'src/a.ts': `// moved\n\nconst pad = 1;\nexport { pad };\n${CALLBACKS}` }),
    ).toEqual(idsOf({ 'src/a.ts': CALLBACKS }));
  });

  it.each([
    ['static first', 'static make(): Cart { return new Cart(); }\n  make(): Cart { return this; }'],
    [
      'instance first',
      'make(): Cart { return this; }\n  static make(): Cart { return new Cart(); }',
    ],
  ])('gives the static member its own suffix when %s', (_, members) => {
    const ids = idsOf({ 'src/cart.ts': `export class Cart {\n  ${members}\n}\n` });

    expect(ids.toSorted()).toEqual(['src/cart.ts#Cart.make', 'src/cart.ts#Cart.make(static)']);
  });

  it('suffixes a static member that has no instance twin', () => {
    expect(idsOf({ 'src/cart.ts': 'export class Cart {\n  static only(): void {}\n}\n' })).toEqual([
      'src/cart.ts#Cart.only(static)',
    ]);
  });
});

describe('the return type of a callable', () => {
  const files = {
    'src/builder.ts':
      "export class Builder {\n  step(): Builder | undefined { return this; }\n  text(): string { return ''; }\n  all(): Builder[] { return []; }\n}\n",
  };

  it('is the id of a project type, as the parameters give it', () => {
    const facts = factsOfFiles(files);

    expect(byId(facts.callables, 'src/builder.ts#Builder.step').returns).toBe(
      'src/builder.ts#Builder',
    );
  });

  it('is the type text for anything else', () => {
    const facts = factsOfFiles(files);

    expect(byId(facts.callables, 'src/builder.ts#Builder.text').returns).toBe('string');
    expect(byId(facts.callables, 'src/builder.ts#Builder.all').returns).toBe('Builder[]');
  });
});
