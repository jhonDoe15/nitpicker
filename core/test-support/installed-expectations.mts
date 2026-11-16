import { runCli } from '../cli.mts';
import { PACKAGE_ROOT } from '../tooling/tool-resolution.mjs';
import { captureOutput } from '../diff/reporting/test-support/output-capture.mts';
import {
  docsRef as untypedDocsRef,
  LATEST_RELEASE_TAG as untypedLatestReleaseTag,
} from '../../shared/messages/docs-url.mjs';
import {
  indexEntries as untypedIndexEntries,
  readReferenceEntries as untypedReadReferenceEntries,
  referenceUrl as untypedReferenceUrl,
} from '../../shared/reference/store.mjs';
import { fieldAt } from '../../scripts/json/fields.mts';
import { textOf } from '../../shared/values/readers.mts';
import { usageText } from '../help/usage-text.mts';
import { projectAnalyzers } from '../command/information/project-analyzers.mts';

export function installedLinks(manifest: unknown): InstalledLinks {
  const repositoryUrl = textOf(fieldAt(manifest, 'repository', 'url'))
    .replace(/^git\+/u, '')
    .replace(/\.git$/u, '');
  return {
    repositoryUrl,
    tagRoot: `${repositoryUrl}/blob/${docsRef({ version: textOf(fieldAt(manifest, 'version')), checkout: false })}`,
    reference: indexEntries(readReferenceEntries()),
  };
}

export function installedHelpUri(links: InstalledLinks, id: string): string | undefined {
  return referenceUrl(links.reference.exact.get(id)?.[0], links.tagRoot);
}

const docsRef: (options: { version: string; checkout: boolean }) => string = untypedDocsRef;
const LATEST_RELEASE_TAG: string = untypedLatestReleaseTag;
const referenceUrl: (entry: unknown, root: string) => string | undefined = untypedReferenceUrl;
const indexEntries: (entries: unknown) => ReferenceIndex = untypedIndexEntries;
const readReferenceEntries: () => unknown = untypedReadReferenceEntries;

type ReferenceIndex = {
  readonly exact: ReadonlyMap<string, readonly unknown[]>;
};

export type InstalledLinks = {
  readonly repositoryUrl: string;
  readonly tagRoot: string;
  readonly reference: ReferenceIndex;
};

const EXAMPLE_PATH = 'src/main/example.ts';
const ENFORCEABLE = 'enforceable';
const PRETTIER_MESSAGE =
  'These lines are not formatted with Prettier. Run `nitpicker --fix` to format the changed files; it skips a file that was already unformatted on the base, so format such lines by hand.';
const DEBUGGER_MESSAGE =
  '`debugger` statement is not allowed. If this is intended, add {"rule":"no-debugger",' +
  '"paths":["src/main/example.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.';
export function expectedDirtyFindings(links: InstalledLinks): object[] {
  return [
    {
      tool: 'eslint-lint',
      rule: 'no-debugger',
      path: EXAMPLE_PATH,
      identity:
        'message:`debugger` statement is not allowed|node:LastStatement|syntax:3e60f1dc2469d9ea675d7a1c|occurrence:1',
      message: DEBUGGER_MESSAGE,
      classification: ENFORCEABLE,
      symbol: 'example',
      location: { line: 2, column: 3 },
      helpUri: installedHelpUri(links, 'eslint-lint/no-debugger'),
      anchor: { key: 'count:`debugger` statement is not allowed:text:3d3cda36d748dcd4e7c34fd3' },
      ratchet: {
        key: 'count:`debugger` statement is not allowed',
        value: 1,
        existingCodeOnly: true,
      },
      exception: { rule: 'no-debugger', paths: [EXAMPLE_PATH], reason: '...' },
      exceptionList: 'exceptions',
    },
    {
      tool: 'prettier-format',
      rule: 'prettier/prettier',
      path: EXAMPLE_PATH,
      identity: 'format-diff:3021261b8c9abc3d63b74d13',
      message: PRETTIER_MESSAGE,
      classification: ENFORCEABLE,
      location: { line: 1, endLine: 1 },
      helpUri: installedHelpUri(links, 'prettier-format/prettier/prettier'),
    },
    {
      tool: 'prettier-format',
      rule: 'prettier/prettier',
      path: EXAMPLE_PATH,
      identity: 'format-diff:92772ea69de4f061a708c457',
      message: PRETTIER_MESSAGE,
      classification: ENFORCEABLE,
      location: { line: 3, endLine: 3 },
      helpUri: installedHelpUri(links, 'prettier-format/prettier/prettier'),
    },
  ];
}
export function expectedSnapshotOutput(): string {
  return [
    "Following this project's conventions:",
    '  Trailing commas: none (used by 1 of 1 measured files)',
    '',
    'Quality snapshot summary',
    '✖ 2 enforceable findings',
    `  prettier-format/prettier/prettier: ${PRETTIER_MESSAGE}`,
    '    src/main/example.ts:1, 3',
    'By analyzer:',
    '  prettier-format: 2 enforceable, 0 descriptive',
    'Ran only: prettier-format. Run nitpicker without --analyzer before you finish.',
    'Full diagnostics: reports/snapshot/report.txt',
    'nitpicker: head: running 1 analyzer',
    '',
  ].join('\n');
}

export function expectedDirtyOutput(): string {
  return `Base: main (argument)

Quality gate summary
✖ 3 new enforceable violations
  by area: format 2 · lint 1
  by label: bug 1 · style 2 (focus with --label <label>)
  prettier-format/prettier/prettier: ${PRETTIER_MESSAGE}
    src/main/example.ts:1, 3
  eslint-lint/no-debugger: ${DEBUGGER_MESSAGE.replace(' If', '\n    src/main/example.ts:2:3\n    If')}
Ran only: eslint-lint, prettier-format. Run nitpicker without --analyzer before you finish.
Full diagnostics: reports/dirty/report.txt
nitpicker: base 2 analyzers cached (node_modules/.cache/nitpicker; use --no-cache to rerun)
nitpicker: head: running 2 analyzers
`;
}

export async function checkoutOutput(
  links: InstalledLinks,
  args: readonly string[],
): Promise<string> {
  const output = captureOutput();
  await runCli({
    arguments_: args,
    currentProjectRoot: PACKAGE_ROOT,
    environment: {},
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return `${output.stdoutText}${output.stderrText}`
    .replaceAll(`${links.repositoryUrl}/blob/main/`, `${links.tagRoot}/`)
    .replaceAll(`${links.repositoryUrl}/blob/${LATEST_RELEASE_TAG}/`, `${links.tagRoot}/`);
}

export function installedHelpText(links: InstalledLinks, projectRoot: string): string {
  return usageText({
    analyzers: projectAnalyzers({ options: {}, currentProjectRoot: projectRoot }),
    referenceUrl: `${links.tagRoot}/docs/usage.md`,
  });
}
