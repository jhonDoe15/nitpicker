import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixWorkingTree } from '../../../core/fix/run-fix.mts';
import { fixOptions, topicRepository, useGitFixtures } from './test-support/fix-test-support.mts';

const { createGitRepository } = useGitFixtures();

const COMMITTED = {
  'package.json': '{ "name": "demo", "type": "module" }\n',
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      target: 'ES2023',
      lib: ['ES2023'],
      types: [],
      noEmit: true,
    },
    include: ['src'],
  }),
};

type Pattern = { readonly before: string; readonly after: string; readonly flags?: string };

const FIXED: readonly Pattern[] = [
  { before: String.raw`\d+\d*`, after: String.raw`\d+` },
  { before: 'a+a+', after: 'a{2,}' },
  { before: String.raw`\w+\d+`, after: String.raw`\w+\d` },
  { before: String.raw`\s*\s*x`, after: String.raw`\s*x` },
  { before: String.raw`[a-z]+[a-z0-9]*x`, after: String.raw`[a-z][a-z0-9]*x` },
  { before: String.raw`[\s\S]*?\s*$`, after: String.raw`[\s\S]*$` },
  { before: 'x*x*', after: 'x*', flags: 'gy' },
  { before: String.raw`(?<=\d+)\d*x`, after: String.raw`(?<=\d)\d*x` },
  { before: '(?:a|b)+b*', after: '(?:a|b)+' },
];

const KEPT: readonly string[] = [
  String.raw`(\d+)\d+`,
  '(a+)(a*)',
  String.raw`^\s+|\s+$`,
  '(a+)+b',
  'a*b*a*',
];

const STRING_PATTERN = "new RegExp('\\\\d+\\\\d*')";
const STRING_FIXED = "new RegExp('\\\\d+')";
const ALPHABET = ['a', 'b', 'x', '1', '_', ' ', 'c', '\n'];
const MAX_LENGTH = 5;

function* inputs(): Generator<string> {
  const layers = [['']];
  for (const layer of layers) {
    if (layers.length <= MAX_LENGTH) {
      layers.push(layer.flatMap((prefix) => ALPHABET.map((letter) => prefix + letter)));
    }
    yield* layer;
  }
}

function matchesOf(pattern: RegExp, text: string): unknown {
  const regexp = new RegExp(pattern.source, pattern.flags.replace(/[gy]/gu, ''));
  const found = regexp.exec(text);
  return found === null ? null : [found.index, found[0]];
}

function sourceFor(patterns: readonly string[]): string {
  return `${patterns.map((pattern, index) => `export const re${String(index)} = ${pattern};`).join('\n')}\n`;
}

function literal({ before, flags }: Pattern): string {
  return `/${before}/${flags ?? ''}`;
}

function run(files: Readonly<Record<string, string>>) {
  const repository = topicRepository(createGitRepository, COMMITTED, files);
  const result = fixWorkingTree(fixOptions(repository.root));
  return {
    result,
    read: (name: string) => readFileSync(path.join(repository.root, name), 'utf8'),
  };
}

describe('the regexp quantifier fixes applied by a plain fix', () => {
  it('rewrites each pattern and string pattern, keeps its flags and leaves captures and alternations alone', () => {
    const { result, read } = run({
      'src/main/fixed.ts': sourceFor(FIXED.map(literal)),
      'src/main/kept.ts': sourceFor(KEPT.map((pattern) => `/${pattern}/`)),
      'src/main/strings.ts': sourceFor([STRING_PATTERN]),
    });

    expect(result.toolErrors).toEqual([]);
    expect(read('src/main/fixed.ts')).toBe(
      sourceFor(FIXED.map(({ after, flags }) => `/${after}/${flags ?? ''}`)),
    );
    expect(read('src/main/kept.ts')).toBe(sourceFor(KEPT.map((pattern) => `/${pattern}/`)));
    expect(read('src/main/strings.ts')).toBe(sourceFor([STRING_FIXED]));
  });

  it.each(FIXED.map((pattern) => [literal(pattern), pattern] as const))(
    'matches the same strings as the original for %s',
    (_name, { before, after, flags }) => {
      const original = new RegExp(before, flags);
      const rewritten = new RegExp(after, flags);
      const differing = [...inputs()].filter(
        (text) =>
          JSON.stringify(matchesOf(original, text)) !== JSON.stringify(matchesOf(rewritten, text)),
      );

      expect(differing).toEqual([]);
    },
  );
});
