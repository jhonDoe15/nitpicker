import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { format } from 'prettier';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeEslintResults } from '../../../../languages/typescript/adapters/eslint/normalize.mts';
import { strictSyntaxConfig } from '../../../../languages/typescript/preset/eslint-config/strict.mts';
import { lintFixture as lintFixtureJs } from '../../../../languages/typescript/preset/failure-messages/test-support/harness.mts';
import { isStrictRule } from '../../../../languages/typescript/preset/strict-rules.mts';
import { compareFindings } from '../../comparison/test-support/typed-compare.mts';
import { writeFiles } from '../../git/test-support/fixture-files.mts';
import {
  commit,
  copyGitTemplate,
  createGitTemplate,
  fixtureGit,
} from '../../git/test-support/git-repository.mts';
import { readChangedLines } from '../../git/test-support/projects/changed-lines-views.mts';

const HANDLERS = 100;
const roots: string[] = [];

const lintFixture: (request: {
  readonly config: unknown;
  readonly filename: string;
  readonly code: string;
}) => unknown[] = lintFixtureJs;

type Added = readonly [string, string, number];
type Files = Readonly<Record<string, string>>;

function typescriptHandler(index: number) {
  return [
    `export function handler${String(index)}(input:unknown,map:Map<string,string>,key:string){`,
    '  const text = input as string',
    `  if(text.length=== ${String(index + 3)}) { return map.get( key )! }`,
    `  const pick = (x:unknown) => (x as number) * ${String(index + 11)}`,
    '  return [ text, map.get(key)!, pick(input), ]',
    '}',
    '',
  ].join('\n');
}

function javascriptHandler(index: number) {
  return [
    `export function handler${String(index)}(items,limit){`,
    "  let total = items.length ? 0 : 'empty'",
    '  for (let k = 0; k < items.length; k++) { total += items[ k ] }',
    `  if (total>limit) return null; else return [ total, ${String(index)}, ]`,
    '}',
    '',
  ].join('\n');
}

const BASE = {
  'src/legacy.ts': Array.from({ length: HANDLERS }, (_, index) => typescriptHandler(index)).join(
    '\n',
  ),
  'src/legacy.js': Array.from({ length: HANDLERS }, (_, index) => javascriptHandler(index)).join(
    '\n',
  ),
};

const ADDED: Readonly<Record<string, Added>> = {
  'src/legacy.ts': ['  const text = input as string;', '  const extra = input as number;', 51],
  'src/legacy.js': ['  else return [total, 50];', '  while (total > limit) total--;', 51],
};

function withLineAdded(text: string, [anchor, added, occurrence]: Added) {
  const lines = text.split('\n');
  const at = lines.flatMap((line, index) => (line === anchor ? [index] : []))[occurrence - 1] ?? -1;
  return [...lines.slice(0, at + 1), added, ...lines.slice(at + 1)].join('\n');
}

async function formattedHead(): Promise<Files> {
  const entries = await Promise.all(
    Object.entries(BASE).map(async ([file, text]) => {
      const formatted = await format(text, { filepath: file });
      const added = ADDED[file];
      return [file, added === undefined ? formatted : withLineAdded(formatted, added)] as const;
    }),
  );
  return Object.fromEntries(entries);
}

function lint(root: string, files: Files) {
  return Object.entries(files).flatMap(([file, code]) =>
    normalizeEslintResults({
      value: [
        {
          filePath: path.join(root, file),
          messages: lintFixture({ config: strictSyntaxConfig, filename: file, code }),
        },
      ],
      projectRoot: root,
      analyzerName: 'eslint-strict',
    }),
  );
}

function compareAcross(root: string, head: Files) {
  const gitTemplate = createGitTemplate();
  copyGitTemplate(gitTemplate, root);
  writeFiles(root, BASE);
  commit(root, 'legacy');
  const baseFindings = lint(root, BASE);
  const mergeBaseSha = fixtureGit(root, ['rev-parse', 'HEAD']).trim();
  writeFiles(root, head);
  commit(root, 'prettier');
  const headSha = fixtureGit(root, ['rev-parse', 'HEAD']).trim();
  const changedLines = readChangedLines({
    repositoryRoot: root,
    mergeBaseSha,
    headSha,
    projectRelativePath: '.',
  });
  return {
    changedLines,
    result: compareFindings({
      baseFindings,
      headFindings: lint(root, head),
      touchedCode: { changedLines, isStrictRule },
    }),
  };
}

describe('a real Prettier run over files full of legacy strict findings', () => {
  let head: Files;
  let comparison: ReturnType<typeof compareAcross>;

  beforeAll(async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-formatter-run-'));
    roots.push(root);
    head = await formattedHead();
    comparison = compareAcross(root, head);
  });

  afterAll(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reformats most lines and still finds only the added lines changed', () => {
    const added = Object.fromEntries(
      Object.entries(ADDED).map(([file, [, line]]) => {
        const number = (head[file] ?? '').split('\n').indexOf(line) + 1;
        return [file, [[number, number]]] as const;
      }),
    );

    expect(head['src/legacy.ts']).not.toBe(BASE['src/legacy.ts']);
    expect(
      Object.fromEntries([...comparison.changedLines].map(([file, { ranges }]) => [file, ranges])),
    ).toEqual(added);
  });

  it('keeps every legacy finding baselined and reports only the findings on the added lines', () => {
    const { newFindings, resolvedFindings, unchangedFindings } = comparison.result;

    expect(resolvedFindings).toEqual([]);
    expect(unchangedFindings.length).toBeGreaterThanOrEqual(HANDLERS * 5);
    expect(newFindings.map(({ path: file, rule }) => `${file} ${String(rule)}`)).toEqual([
      'src/legacy.js no-restricted-syntax',
      'src/legacy.ts no-restricted-syntax',
    ]);
  });
});
