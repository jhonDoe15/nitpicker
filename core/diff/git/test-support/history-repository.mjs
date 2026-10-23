import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { fixtureGit } from './git-repository.mjs';

const SHORT_SHA_LENGTH = 7;
const TOGETHER_COMMITS = 8;
const BILLING_ALONE_COMMITS = 4;
const SHIPPING_ALONE_COMMITS = 4;
const UI_ALONE_COMMITS = 6;
const LATER_ROUND = 100;
const FIXTURE_IDENTITY = 'Nitpicker Fixture <nitpicker@example.invalid>';
const FIRST_COMMIT_SECONDS = 1_767_225_600;

export function edit(paths, round) {
  return Object.fromEntries(
    paths.map((file) => [file, `export const value = ${String(round)};\n`]),
  );
}

export function repeated(count, makeStep) {
  return Array.from({ length: count }, (_, index) => makeStep(index));
}

function dataBlock(text) {
  return `data ${String(Buffer.byteLength(text))}\n${text}\n`;
}

function branchTip(root) {
  const tip = fixtureGit(root, [
    'for-each-ref',
    '--format=%(objectname)',
    'refs/heads/main',
  ]).trim();
  return tip === '' ? undefined : tip;
}

function commitBlock(step, { index, parent }) {
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

export function importHistory(root, steps) {
  const tip = branchTip(root);
  const stream = steps
    .map((step, index) => commitBlock(step, { index, parent: index === 0 ? tip : undefined }))
    .join('');
  fixtureGit(root, ['fast-import', '--quiet'], { input: stream });
  fixtureGit(root, ['reset', '-q', '--hard', 'main']);
}

export function shortShaOf(root, message) {
  const [sha] = fixtureGit(root, ['log', '--format=%H', '-n', '1', `--grep=^${message}$`])
    .trim()
    .split('\n');
  return sha.slice(0, SHORT_SHA_LENGTH);
}

export const SOURCE_FILES = {
  'src/billing/invoice.ts': 'export const value = 0;\n',
  'src/invoicing/ledger.ts': 'export const value = 0;\n',
  'src/shipping/route.ts': 'export const value = 0;\n',
  'src/ui/page.ts': 'export const value = 0;\n',
};

export function amplifiedHistory() {
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

export function useHistoryRepositories() {
  const roots = [];

  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function temporaryRoot(prefix = 'nitpicker-history-') {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
    roots.push(root);
    return root;
  }

  function historyRepository({ files = SOURCE_FILES, steps = amplifiedHistory() } = {}) {
    const root = temporaryRoot();
    fixtureGit(root, ['init', '-q', '--initial-branch=main']);
    importHistory(root, [{ files, message: 'base' }]);
    importHistory(root, steps);
    return root;
  }

  return { temporaryRoot, historyRepository };
}
