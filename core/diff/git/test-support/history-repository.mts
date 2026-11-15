import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { type FileMap } from './fixture-files.mts';
import { fixtureGit } from './git-repository.mts';

const SHORT_SHA_LENGTH = 7;
const TOGETHER_COMMITS = 8;
const BILLING_ALONE_COMMITS = 4;
const SHIPPING_ALONE_COMMITS = 4;
const UI_ALONE_COMMITS = 6;
const LATER_ROUND = 100;
const FIXTURE_IDENTITY = 'Nitpicker Fixture <nitpicker@example.invalid>';
const FIRST_COMMIT_SECONDS = 1_767_225_600;

export type HistoryStep = {
  readonly message?: string;
  readonly files?: FileMap;
  readonly renames?: readonly (readonly [string, string])[];
  readonly deletes?: readonly string[];
};

export function edit(paths: readonly string[], round: number): FileMap {
  return Object.fromEntries(
    paths.map((file) => [file, `export const value = ${String(round)};\n`]),
  );
}

export function repeated<Step>(count: number, makeStep: (index: number) => Step): Step[] {
  return Array.from({ length: count }, (_, index) => makeStep(index));
}

function dataBlock(text: string): string {
  return `data ${String(Buffer.byteLength(text))}\n${text}\n`;
}

function branchTip(root: string): string | undefined {
  const tip = fixtureGit(root, [
    'for-each-ref',
    '--format=%(objectname)',
    'refs/heads/main',
  ]).trim();
  return tip === '' ? undefined : tip;
}

function commitBlock(
  step: HistoryStep,
  { index, parent }: { readonly index: number; readonly parent: string | undefined },
): string {
  return [
    'commit refs/heads/main\n',
    `committer ${FIXTURE_IDENTITY} ${String(FIRST_COMMIT_SECONDS + index)} +0000\n`,
    dataBlock(step.message ?? `change ${String(index)}`),
    ...(parent === undefined ? [] : [`from ${parent}\n`]),
    ...(step.renames ?? []).map(([from, to]) => `R ${from} ${to}\n`),
    ...(step.deletes ?? []).map((file) => `D ${file}\n`),
    ...Object.entries(step.files ?? {}).map(
      ([file, text]) => `M 100644 inline ${file}\n${dataBlock(text)}`,
    ),
    '\n',
  ].join('');
}

export function importHistory(root: string, steps: readonly HistoryStep[]): void {
  const tip = branchTip(root);
  const stream = steps
    .map((step, index) => commitBlock(step, { index, parent: index === 0 ? tip : undefined }))
    .join('');
  fixtureGit(root, ['fast-import', '--quiet'], { input: stream });
  fixtureGit(root, ['reset', '-q', '--hard', 'main']);
}

export function shortShaOf(root: string, message: string): string {
  const [sha = ''] = fixtureGit(root, ['log', '--format=%H', '-n', '1', `--grep=^${message}$`])
    .trim()
    .split('\n');
  return sha.slice(0, SHORT_SHA_LENGTH);
}

export const SOURCE_FILES: FileMap = {
  'src/billing/invoice.ts': 'export const value = 0;\n',
  'src/invoicing/ledger.ts': 'export const value = 0;\n',
  'src/shipping/route.ts': 'export const value = 0;\n',
  'src/ui/page.ts': 'export const value = 0;\n',
};

export function amplifiedHistory(): HistoryStep[] {
  return [
    ...repeated(TOGETHER_COMMITS, (round) => ({
      files: edit(['src/billing/invoice.ts', 'src/invoicing/ledger.ts'], round + 1),
    })),
    ...repeated(BILLING_ALONE_COMMITS, (round) => ({
      files: edit(['src/billing/invoice.ts'], round + LATER_ROUND),
    })),
    ...repeated(SHIPPING_ALONE_COMMITS, (round) => ({
      files: edit(['src/shipping/route.ts'], round + LATER_ROUND),
    })),
    ...repeated(UI_ALONE_COMMITS, (round) => ({
      files: edit(['src/ui/page.ts'], round + LATER_ROUND),
    })),
  ];
}

export function useHistoryRepositories(): {
  readonly temporaryRoot: (prefix?: string) => string;
  readonly historyRepository: (options?: {
    readonly files?: FileMap;
    readonly steps?: readonly HistoryStep[];
  }) => string;
} {
  const roots: string[] = [];

  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function temporaryRoot(prefix = 'nitpicker-history-'): string {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
    roots.push(root);
    return root;
  }

  function historyRepository({
    files = SOURCE_FILES,
    steps = amplifiedHistory(),
  }: { readonly files?: FileMap; readonly steps?: readonly HistoryStep[] } = {}): string {
    const root = temporaryRoot();
    fixtureGit(root, ['init', '-q', '--initial-branch=main']);
    importHistory(root, [{ files, message: 'base' }]);
    importHistory(root, steps);
    return root;
  }

  return { temporaryRoot, historyRepository };
}
