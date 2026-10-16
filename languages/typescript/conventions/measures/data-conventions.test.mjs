import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';
import { layeredPrettierOptions } from '../../adapters/prettier/prettier-layers.mjs';
import { dataConventionOptions, dataFileKind, DATA_CONVENTIONS } from './data-conventions.mjs';

const measures = Object.fromEntries(DATA_CONVENTIONS.map(({ id, measure }) => [id, measure]));
const json = '{"name":"demo","scripts":{"build":"tsc","test":"vitest"},"files":["dist",{"a":1}]}';
const yaml = `name: ci
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          depth: 1
      - run: npm test
`;

const parsers = {
  'prettier.jsonIndentation': ['json', json],
  'prettier.yamlIndentation': ['yaml', yaml],
};

describe('data conventions', () => {
  for (const convention of DATA_CONVENTIONS) {
    for (const option of convention.options) {
      it(`reads ${convention.id} = ${option} from a file Prettier formatted that way`, async () => {
        const [parser, text] = parsers[convention.id];
        const options = option === 'tab' ? { useTabs: true } : { tabWidth: Number(option) };

        expect(convention.measure(await prettier.format(text, { parser, ...options }))).toBe(
          option,
        );
      });
    }
  }

  it.each([
    ['prettier.jsonIndentation', '{"a":1,"b":[1,2]}\n', undefined],
    ['prettier.jsonIndentation', '{\n    "a": {\n        "b": 1\n    }\n}\n', '4'],
    ['prettier.jsonIndentation', '{\n\t"a": {\n\t\t"b": 1\n\t}\n}\n', 'tab'],
    ['prettier.yamlIndentation', 'a: 1\nb: 2\n', undefined],
    ['prettier.yamlIndentation', '# a:\nkey:\n  - one\n  - two\n', '2'],
    ['prettier.yamlIndentation', 'key:\n- one\n- two\n', undefined],
    ['prettier.yamlIndentation', 'script: |\n    a\n    b\nkey:\n    nested: 1\n', '4'],
    ['prettier.yamlIndentation', '- name: a\n  items:\n    - x\n', '2'],
    ['prettier.yamlIndentation', 'key:\n   odd: 1\n', undefined],
    ['prettier.yamlIndentation', '- items:\n      - x\n', undefined],
  ])('%s on %j', (id, text, expected) => {
    expect(measures[id](text)).toBe(expected);
  });

  it('maps the choices to Prettier options per file kind', () => {
    expect(dataFileKind('src/data.json')).toBe('json');
    expect(dataFileKind('ci/build.yml')).toBe('yaml');
    expect(dataFileKind('src/index.ts')).toBeUndefined();
    expect(dataConventionOptions('json', { 'prettier.jsonIndentation': 'tab' })).toEqual({
      useTabs: true,
    });
    expect(dataConventionOptions('yaml', { 'prettier.yamlIndentation': '4' })).toEqual({
      useTabs: false,
      tabWidth: 4,
    });
    expect(dataConventionOptions('yaml', {})).toEqual({});
    expect(dataConventionOptions('yaml', {}, { followed: true })).toEqual({
      useTabs: false,
      tabWidth: 2,
    });
  });
});

describe('data conventions in the Prettier layers', () => {
  async function optionsFor(relativePath, precedence) {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-data-conventions-'));
    const policyFile = path.join(directory, 'policy.json');
    writeFileSync(
      policyFile,
      JSON.stringify({
        conventions: { 'prettier.jsonIndentation': '4', 'prettier.yamlIndentation': '4' },
      }),
    );
    const previous = process.env.NITPICKER_POLICY;
    process.env.NITPICKER_POLICY = policyFile;
    try {
      return await layeredPrettierOptions(prettier, {
        precedence,
        policyOptions: { singleQuote: true },
        liveProjectRoot: directory,
        relativePath,
      });
    } finally {
      if (previous === undefined) {
        delete process.env.NITPICKER_POLICY;
      } else {
        process.env.NITPICKER_POLICY = previous;
      }
      rmSync(directory, { recursive: true, force: true });
    }
  }

  it.each([
    ['package.json', ['nitpicker'], { singleQuote: true, useTabs: false, tabWidth: 4 }],
    ['ci.yml', ['nitpicker'], { singleQuote: true, useTabs: false, tabWidth: 4 }],
    ['ci.yml', ['project'], { useTabs: false, tabWidth: 4 }],
    ['index.ts', ['nitpicker'], { singleQuote: true }],
    ['README.md', ['nitpicker'], { singleQuote: true }],
  ])('%s under %j gets %j', async (relativePath, precedence, expected) => {
    expect(await optionsFor(relativePath, precedence)).toEqual(expected);
  });
});
