import { ruleEntry } from '../entry.mts';
import type { DocsLink, RuleEntry } from '../typed/entry-types.mts';

type DeadCodeRow = readonly [
  rule: string,
  summary: string,
  why: string,
  allowed: string,
  narrowing?: { readonly name?: true },
];
type CodingStandardsRow = readonly [
  rule: string,
  summary: string,
  why: string,
  allowed: string,
  pattern?: string,
  sample?: string,
];

const DEAD_CODE_TOOL = 'dead-code';
const CODING_STANDARDS_TOOL = 'coding-standards';
const TYPESCRIPT_AND_JAVASCRIPT = {
  typescript: [DEAD_CODE_TOOL],
  javascript: [DEAD_CODE_TOOL],
};
const CODING_STANDARDS = {
  typescript: [CODING_STANDARDS_TOOL],
  javascript: [CODING_STANDARDS_TOOL],
};
const CHECKS_DOCS: readonly DocsLink[] = [{ label: 'Checks catalog', path: 'spec/checks.md' }];

const DEAD_CODE_ROWS: readonly DeadCodeRow[] = [
  [
    'files',
    'Unused file.',
    'Nothing imports the file, and no entry point, test or configuration reaches it.',
    'Delete the file, or import it where it is needed.',
  ],
  [
    'exports',
    'Unused export.',
    'An export that nothing imports is dead surface; every reader has to understand it.',
    'Remove `export`, or the declaration if nothing uses it.',
    { name: true },
  ],
  [
    'types',
    'Unused exported type.',
    'An exported type that nothing imports is dead surface; every reader has to understand it.',
    'Remove `export`, or the type if nothing uses it.',
    { name: true },
  ],
];

const CODING_STANDARDS_ROWS: readonly CodingStandardsRow[] = [
  [
    'public-contract-production-use',
    'A method of an exported interface that a production class implements, which no production code outside the implementations uses.',
    'A contract method that production code never calls is dead surface that every implementation has to carry.',
    'Remove the method from the interface, or call it from production code.',
  ],
  [
    'runtime-boundary/<rule>',
    'A module breaks the runtime boundary of its role: `forbidden-runtime-dependency`, `forbidden-runtime-call` or `unresolved-runtime-dependency`.',
    'Module roles keep the runtime dependencies and side effects of each layer in one direction. No role is declared by default, so the rules report only where a role is configured.',
    'Depend on the allowed module, move the call to a module whose role may make it, and write the specifier of a dynamic import as a string literal.',
    '^runtime-boundary/.+$',
    'runtime-boundary/forbidden-runtime-call',
  ],
  [
    'callback-protocol/<rule>',
    'A callback breaks its protocol: `source-loader-does-not-merge-published-state`, `publication-owner-does-not-commit-external-state` or `correlated-callback-declares-correlation-input`.',
    'Callbacks that belong together keep one owner for the state they publish and declare the input that correlates them. No contract is declared by default, so the rules report only where a callback contract is configured.',
    'Commit published state in its owner, read only bounded metadata or independent upstream snapshots in a loader, and declare the correlation input in the options.',
    '^callback-protocol/.+$',
    'callback-protocol/source-loader-does-not-merge-published-state',
  ],
];

function deadCodeEntry([rule, summary, why, allowed, narrowing = {}]: DeadCodeRow): RuleEntry {
  return ruleEntry({
    tool: DEAD_CODE_TOOL,
    rule,
    page: 'checks',
    analyzers: TYPESCRIPT_AND_JAVASCRIPT,
    summary,
    why,
    allowed,
    exception: { key: 'exceptions', rule, ...narrowing },
    docs: CHECKS_DOCS,
  });
}

function codingStandardsEntry([
  rule,
  summary,
  why,
  allowed,
  pattern,
  sample,
]: CodingStandardsRow): RuleEntry {
  return ruleEntry({
    tool: CODING_STANDARDS_TOOL,
    rule,
    page: 'checks',
    analyzers: CODING_STANDARDS,
    summary,
    why,
    allowed,
    ...(pattern === undefined
      ? {}
      : { pattern, barePattern: true, samples: [`coding-standards/${String(sample)}`] }),
    exception: { key: 'exceptions', rule },
    docs: CHECKS_DOCS,
  });
}

export function typescriptCheckEntries(): RuleEntry[] {
  return [...DEAD_CODE_ROWS.map(deadCodeEntry), ...CODING_STANDARDS_ROWS.map(codingStandardsEntry)];
}
