import { commit, fixtureGit } from './git-repository.mjs';
import { renameFile, writeFiles } from './fixture-files.mjs';

const SHORT_SHA_LENGTH = 7;
const TOGETHER_COMMITS = 8;
const BILLING_ALONE_COMMITS = 4;
const SHIPPING_ALONE_COMMITS = 4;
const UI_ALONE_COMMITS = 6;
const LATER_ROUND = 100;

export function edit(paths, round) {
  return Object.fromEntries(
    paths.map((file) => [file, `export const value = ${String(round)};\n`]),
  );
}

export function commitSteps(root, steps) {
  for (const [index, step] of steps.entries()) {
    writeFiles(root, step.files ?? {});
    for (const [from, to] of step.renames ?? []) {
      renameFile(root, from, to);
    }
    commit(root, step.message ?? `change ${String(index)}`);
  }
}

export function repeated(count, makeStep) {
  return Array.from({ length: count }, (_, index) => makeStep(index));
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
