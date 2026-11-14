import { allowedFormOf, without } from '../../plan-parts/finding.mjs';
import { ALL_PRESETS } from '../../plan-parts/presets.mjs';
import { stepsOf } from '../../plan-parts/steps.mjs';

const REPEATS = /^This code repeats (\S+?)(?::(\d+))?(?: \((\d+) lines\))?\.(?:\s|$)/u;
const SIBLINGS = /not in (.+?), where it has/u;
const LIST_SEPARATOR = /,\s*|\s+and\s+/u;

function copiesOf(finding, match) {
  const kept = finding.ratchet?.mustKeepUnchangedLines;
  if (Array.isArray(kept) && kept.length === 2) {
    return kept.map(({ path, startLine, endLine }) => ({ path, startLine, endLine }));
  }
  const lines = match?.[3] === undefined ? 1 : Number(match[3]);
  const start = finding.location?.line ?? 1;
  const other = match?.[1];
  const otherStart = match?.[2] === undefined ? 1 : Number(match[2]);
  return [
    { path: finding.path, startLine: start, endLine: start + lines - 1 },
    ...(other === undefined
      ? []
      : [{ path: other, startLine: otherStart, endLine: otherStart + lines - 1 }]),
  ];
}

function removeClone(finding) {
  const match = REPEATS.exec(finding.message);
  const copies = copiesOf(finding, match);
  const [first, second] = copies;
  const sameFile = second !== undefined && first.path === second.path;
  const places = copies.map(
    ({ path, startLine, endLine }) => `${path}:${String(startLine)}-${String(endLine)}`,
  );
  return {
    kind: 'remove-duplicate',
    target: first,
    context: without({
      copies,
      lines: match?.[3] === undefined ? undefined : Number(match[3]),
      sameFile,
    }),
    steps: stepsOf(
      `Compare the copies: ${places.join(' and ')}.`,
      sameFile
        ? 'Extract the shared code into one function in this file.'
        : 'Extract the shared code into one function in one of the two files, or in a module both import.',
      'Make both places call it; pass what differs (names, literals) as parameters.',
      allowedFormOf(finding, 'Keep one copy and call it from both places.'),
      'Keep the behavior of both callers: run their tests.',
    ),
  };
}

function siblingCopy(finding) {
  const others = SIBLINGS.exec(finding.message)?.[1]?.split(LIST_SEPARATOR) ?? [];
  const line = finding.location?.line ?? 1;
  return {
    kind: 'remove-duplicate',
    target: { path: finding.path, symbol: finding.symbol, startLine: line, endLine: line },
    context: without({ others: others.length === 0 ? undefined : others }),
    steps: stepsOf(
      others.length === 0
        ? 'Find the same-named copy of this code in another module.'
        : `Compare it with the copy in ${others.join(', ')}.`,
      allowedFormOf(finding, 'Edit it there too, or merge the copies.'),
      'Prefer merging the copies into one shared function.',
    ),
  };
}

export const DUPLICATE_BUILDERS = [
  {
    id: 'remove-clone',
    rules: [{ tool: 'duplicates', rule: 'duplicate-clone' }],
    presets: ALL_PRESETS,
    build: removeClone,
  },
  {
    id: 'merge-sibling-copies',
    rules: [{ tool: 'structure', rule: 'sibling-copy-edit' }],
    presets: ALL_PRESETS,
    build: siblingCopy,
  },
];
