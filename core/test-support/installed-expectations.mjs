import { runCli } from '../cli.mjs';
import { PACKAGE_ROOT } from '../tooling/tool-resolution.mjs';
import { captureOutput } from '../diff/reporting/test-support/output-capture.mjs';
import { docsRef } from '../../shared/messages/docs-url.mjs';
import { indexEntries, readReferenceEntries, referenceUrl } from '../../shared/reference/store.mjs';

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
      ratchet: {
        key: 'count:`debugger` statement is not allowed',
        value: 1,
        existingCodeOnly: true,
      },
    },
    {
      tool: 'prettier-format',
      rule: 'prettier/prettier',
      path: 'src/main/example.ts',
      identity: 'format-diff:3021261b8c9abc3d63b74d13',
      message: 'Format these lines with Prettier',
      classification: 'enforceable',
      location: { line: 1, endLine: 1 },
      helpUri: installedHelpUri(links, 'prettier-format/prettier/prettier'),
    },
    {
      tool: 'prettier-format',
      rule: 'prettier/prettier',
      path: 'src/main/example.ts',
      identity: 'format-diff:92772ea69de4f061a708c457',
      message: 'Format these lines with Prettier',
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
    '',
    'Per-tool counts:',
    'prettier-format: total=2 enforceable=2 descriptive=0',
    '',
    'Enforceable findings:',
    'prettier-format/prettier/prettier src/main/example.ts:1 Format these lines with Prettier',
    'prettier-format/prettier/prettier src/main/example.ts:3 Format these lines with Prettier',
    '',
    `Rule reference: ${links.tagRoot}/docs/rules/README.md (nitpicker explain <tool/rule> prints one rule)`,
    'nitpicker: head: running 1 analyzer',
    '',
  ].join('\n');
}

/** What a dirty diff run of the installed package prints, with its reports under `root`. */
export function expectedDirtyOutput(root) {
  return `Base: main (argument)

Quality gate summary
✖ 3 new enforceable violations
  eslint-lint/no-debugger src/main/example.ts:2
    ${DEBUGGER_MESSAGE}
  prettier-format/prettier/prettier src/main/example.ts (2 times, lines 1, 3)
    Format these lines with Prettier
Full diagnostics: ${root}/reports/dirty/report.txt
nitpicker: base 2 analyzers cached (${root}/node_modules/.cache/nitpicker; use --no-cache to rerun)
nitpicker: head: running 2 analyzers
`;
}

/** What the checkout prints for `args`, with its links moved to the release tag. */
export function checkoutOutput(links, args) {
  const output = captureOutput();
  runCli({
    arguments_: args,
    currentProjectRoot: PACKAGE_ROOT,
    environment: {},
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return `${output.stdoutText}${output.stderrText}`.replaceAll(
    `${links.repositoryUrl}/blob/main/`,
    `${links.tagRoot}/`,
  );
}
