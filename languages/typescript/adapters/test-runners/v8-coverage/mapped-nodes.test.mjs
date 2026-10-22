import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { unmappedNodeFilter } from './mapped-nodes.mjs';

const ORIGINAL = [
  'export const later = async (flag?: boolean) => (flag ? 1 : 0);',
  'export function named() {}',
  'exports.own = own;',
].join('\n');

const GENERATED = [
  'var __name=(target,value)=>target;',
  'const later=__name(async flag=>flag?1:0,"later");',
  'function named(){}',
  '__name(named,"named");',
  'exports.named=named;',
  'exports.own=own;',
  '__export(all,{named:()=>named});',
].join('');

function at(generated, line, original) {
  const lines = ORIGINAL.split('\n');
  return [GENERATED.indexOf(generated), 0, line, lines[line].indexOf(original)];
}

const ENUMS =
  'export enum Kind {\n  A,\n}\nexport namespace Space {\n  export const value = 1;\n}\n';

const ENUMS_GENERATED = [
  'var Kind=(Kind2=>{Kind2[Kind2["A"]=0]="A";return Kind2})(Kind||{});',
  'var Space;(Space2=>{Space2.value=1})(Space||(Space={}));',
].join('');

const atEnum = (generated, line, column) => [ENUMS_GENERATED.indexOf(generated), 0, line, column];

const SOURCE_MAP = {
  version: 3,
  sources: ['later.ts'],
  sourcesContent: [ORIGINAL],
  names: [],
  mappings: [
    [
      at('const later', 0, 'const'),
      at('later=', 0, 'later'),
      at('__name(async', 0, 'async'),
      at('flag=>', 0, 'flag'),
      at('flag?1', 0, 'flag ?'),
      at('function named', 1, 'function'),
      at('__name(named', 1, 'named'),
      at('exports.named', 1, 'export'),
      at('exports.own', 2, 'exports'),
    ].toSorted(([left], [right]) => left - right),
  ],
};

describe('the nodes of rewritten code that came from the file', () => {
  it('keeps the code the file wrote and drops what the loader added around it', () => {
    const ast = parse(GENERATED, { ecmaVersion: 'latest' });
    const ignored = unmappedNodeFilter({ code: GENERATED, ast, sourceMap: SOURCE_MAP });
    const [helper, later, named, nameCall, exported, own, getters] = ast.body;
    const wrapped = later.declarations[0].init.arguments[0];

    expect(
      [
        helper.declarations[0],
        helper.declarations[0].init,
        later.declarations[0],
        wrapped,
        named,
        nameCall,
        exported,
        own,
        getters,
        getters.expression.arguments[1].properties[0].value,
      ].map((node) => ignored(node)),
    ).toEqual([true, true, false, false, false, true, true, false, true, true]);
  });

  it('drops the fallback argument of the function a loader writes for an enum', () => {
    const ast = parse(ENUMS_GENERATED, { ecmaVersion: 'latest' });
    const sourceMap = {
      version: 3,
      sources: ['kinds.ts'],
      sourcesContent: [ENUMS],
      names: [],
      mappings: [
        [
          atEnum('Kind=', 0, 'export enum '.length),
          atEnum('Kind||', 0, 'export enum '.length),
          atEnum('Space2.value', 4, 'export const '.length),
          atEnum('Space||', 3, 'export namespace '.length),
        ],
      ],
    };
    const ignored = unmappedNodeFilter({ code: ENUMS_GENERATED, ast, sourceMap });
    const [kind, , space] = ast.body;

    expect(
      [kind.declarations[0].init.arguments[0], space.expression.arguments[0]].map(ignored),
    ).toEqual([true, false]);
  });
});
