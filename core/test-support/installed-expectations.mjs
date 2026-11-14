import { runCli } from '../cli.mts';
import { PACKAGE_ROOT } from '../tooling/tool-resolution.mjs';
import { captureOutput } from '../diff/reporting/test-support/output-capture.mjs';
import { docsRef, LATEST_RELEASE_TAG } from '../../shared/messages/docs-url.mjs';
import { indexEntries, readReferenceEntries, referenceUrl } from '../../shared/reference/store.mjs';
import { usageText } from '../help/usage-text.mts';
import { projectAnalyzers } from '../command/information/project-analyzers.mts';

/** The links of an installed copy of the package with `manifest`: they point at its release tag. */
export function installedLinks(manifest) {
  const repositoryUrl = manifest.repository.url.replace(/^git\+/u, '').replace(/\.git$/u, '');
  return {
    repositoryUrl,
    tagRoot: `${repositoryUrl}/blob/${docsRef({ version: manifest.version, checkout: false })}`,
    reference: indexEntries(readReferenceEntries()),
  };
}

/** The helpUri an installed package gives the findings of rule `id`: its entry at the release tag. */
export function installedHelpUri(links, id) {
  return referenceUrl(links.reference.exact.get(id)[0], links.tagRoot);
}

const PRETTIER_MESSAGE =
  'These lines are not formatted with Prettier. Run `nitpicker --fix` to format the changed files; it skips a file that was already unformatted on the base, so format such lines by hand.';
const DEBUGGER_MESSAGE =
  '`debugger` statement is not allowed. If this is intended, add {"rule":"no-debugger",' +
  '"paths":["src/main/example.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.';
/** The findings a dirty run of the installed package writes. */
export function expectedDirtyFindings(links) {
  return [
    {
      tool: 'eslint-lint',
      rule: 'no-debugger',
      path: 'src/main/example.ts',
      identity:
        'message:`debugger` statement is not allowed|node:LastStatement|syntax:3e60f1dc2469d9ea675d7a1c|occurrence:1',
      message: DEBUGGER_MESSAGE,
      classification: 'enforceable',
      symbol: 'example',
      location: { line: 2, column: 3 },
      helpUri: installedHelpUri(links, 'eslint-lint/no-debugger'),
      anchor: { key: 'count:`debugger` statement is not allowed:text:3d3cda36d748dcd4e7c34fd3' },
      ratchet: {
        key: 'count:`debugger` statement is not allowed',
        value: 1,
        existingCodeOnly: true,
      },
      exception: { rule: 'no-debugger', paths: ['src/main/example.ts'], reason: '...' },
      exceptionList: 'exceptions',
    },
    {
      tool: 'prettier-format',
      rule: 'prettier/prettier',
      path: 'src/main/example.ts',
      identity: 'format-diff:3021261b8c9abc3d63b74d13',
      message: PRETTIER_MESSAGE,
      classification: 'enforceable',
      location: { line: 1, endLine: 1 },
      helpUri: installedHelpUri(links, 'prettier-format/prettier/prettier'),
    },
    {
      tool: 'prettier-format',
      rule: 'prettier/prettier',
      path: 'src/main/example.ts',
      identity: 'format-diff:92772ea69de4f061a708c457',
      message: PRETTIER_MESSAGE,
      classification: 'enforceable',
      location: { line: 3, endLine: 3 },
      helpUri: installedHelpUri(links, 'prettier-format/prettier/prettier'),
    },
  ];
}
/** What a snapshot run of the installed package prints. */
export function expectedSnapshotOutput(links) {
  return [
    "Following this project's conventions:",
    '  Trailing commas: none (used by 1 of 1 measured files)',
    'Nitpicker quality snapshot',
    'Status: violations',
    'Enforceable findings: 2',
    'Descriptive findings: 0',
    'Tool errors: 0',
    'Ran only: prettier-format. Run nitpicker without --analyzer before you finish.',
    '',
    'Per-tool counts:',
    'prettier-format: total=2 enforceable=2 descriptive=0',
    '',
    'Enforceable findings:',
    `prettier-format/prettier/prettier src/main/example.ts:1 ${PRETTIER_MESSAGE}`,
    `prettier-format/prettier/prettier src/main/example.ts:3 ${PRETTIER_MESSAGE}`,
    '',
    `Rule reference: ${links.tagRoot}/docs/rules/README.md (nitpicker explain <tool/rule> prints one rule)`,
    'nitpicker: head: running 1 analyzer',
    '',
  ].join('\n');
}

/** What a dirty diff run of the installed package prints from the consumer root. */
export function expectedDirtyOutput() {
  return `Base: main (argument)

Quality gate summary
✖ 3 new enforceable violations
  by area: format 2 · lint 1
  prettier-format/prettier/prettier: ${PRETTIER_MESSAGE}
    src/main/example.ts:1, 3
  eslint-lint/no-debugger: ${DEBUGGER_MESSAGE.replace(' If', '\n    src/main/example.ts:2:3\n    If')}
Ran only: eslint-lint, prettier-format. Run nitpicker without --analyzer before you finish.
Full diagnostics: reports/dirty/report.txt
nitpicker: base 2 analyzers cached (node_modules/.cache/nitpicker; use --no-cache to rerun)
nitpicker: head: running 2 analyzers
`;
}

/** What the checkout prints for `args`, with its links moved to the release tag. */
export async function checkoutOutput(links, args) {
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

/** The help an installed package prints in `projectRoot`: its usage page at its release tag. */
export function installedHelpText(links, projectRoot) {
  return usageText({
    analyzers: projectAnalyzers({ options: {}, currentProjectRoot: projectRoot }),
    referenceUrl: `${links.tagRoot}/docs/usage.md`,
  });
}
