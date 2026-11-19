import type { Node } from 'web-tree-sitter';
import { depthFirst } from '../jvm-views.mts';
import { switchOf, type Arm, type Switch } from './switch-arms.mts';
import type { Grammar, ShorterFix } from './shorter-fixes.mts';

type Source = { readonly file: string; readonly text: string };
type Edit = ShorterFix['edits'][number];
type Span = { readonly start: number; readonly end: number };

const COMMENT = /\/[/*]/u;
const SWITCHES = new Set(['switch_block', 'when_expression']);

function isComparable(owner: Switch, arm: Arm, index: number): boolean {
  const before = owner.arms[index - 1];
  return (
    arm.mergeable &&
    arm.jumps &&
    arm.body !== '' &&
    arm.body !== '{ }' &&
    (before === undefined || before.jumps) &&
    !arm.nodes.some(({ text }) => COMMENT.test(text))
  );
}

function classesOf(owner: Switch): Arm[][] {
  const classes = new Map<string, Arm[]>();
  for (const [index, arm] of owner.arms.entries()) {
    if (isComparable(owner, arm, index)) {
      classes.set(arm.body, [...(classes.get(arm.body) ?? []), arm]);
    }
  }
  const found = [...classes.values()].filter((arms) => arms.length > 1);
  return owner.kind === 'when' ? found.flatMap((arms) => adjacentRuns(owner, arms)) : found;
}

function adjacentRuns(owner: Switch, arms: readonly Arm[]): Arm[][] {
  const runs: Arm[][] = [];
  for (const arm of arms) {
    const last = runs.at(-1);
    const previous = last?.at(-1);
    if (
      last !== undefined &&
      previous !== undefined &&
      owner.arms.indexOf(previous) === owner.arms.indexOf(arm) - 1
    ) {
      last.push(arm);
    } else {
      runs.push([arm]);
    }
  }
  return runs.filter((run) => run.length > 1);
}

function addedLabels(kind: Switch['kind'], moved: readonly Arm[]): string {
  if (kind === 'colon') {
    return moved.flatMap(({ labels }) => labels.map(({ text }) => ` ${text}:`)).join('');
  }
  const parts = moved.flatMap(({ labels }) =>
    kind === 'when'
      ? labels.map(({ text }) => text)
      : labels.flatMap((label) => label.namedChildren.map(({ text }) => text)),
  );
  return parts.map((part) => `, ${part}`).join('');
}

function insertionAt(kind: Switch['kind'], target: Arm): number {
  const label = target.labels.at(-1);
  if (label === undefined) {
    return -1;
  }
  const colon = label.nextSibling;
  return kind === 'colon' && colon?.type === ':' ? colon.endIndex : label.endIndex;
}

function removal(text: string, { start, end }: Span): Span {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const newline = text.indexOf('\n', end);
  const lineEnd = newline === -1 ? text.length : newline + 1;
  const alone =
    text.slice(lineStart, start).trim() === '' && text.slice(end, lineEnd).trim() === '';
  if (alone) {
    return { start: lineStart, end: lineEnd };
  }
  const trailing = /^[ \t]*/u.exec(text.slice(end))?.[0].length ?? 0;
  return { start, end: end + trailing };
}

function spanOf(arm: Arm): Span {
  return { start: arm.nodes[0]?.startIndex ?? 0, end: arm.nodes.at(-1)?.endIndex ?? 0 };
}

function fixOf(
  owner: Switch,
  arms: readonly Arm[],
  { file, text }: Source,
): ShorterFix | undefined {
  const [target, ...moved] = arms;
  const at = target === undefined ? -1 : insertionAt(owner.kind, target);
  const first = moved[0]?.nodes[0];
  if (target === undefined || first === undefined || at < 0) {
    return undefined;
  }
  function edit(start: number, end: number, replacement: string): Edit {
    return { type: 'replace', path: file, start, end, text: replacement };
  }
  return {
    finding: {
      tool: 'structure',
      rule: 'duplicate-branch',
      path: file,
      line: first.startPosition.row + 1,
    },
    edits: [
      edit(at, at, addedLabels(owner.kind, moved)),
      ...moved
        .map((arm) => removal(text, spanOf(arm)))
        .map(({ start, end }) => edit(start, end, '')),
    ],
  };
}

function overlaps(left: readonly Edit[], right: readonly Edit[]): boolean {
  return left.some((one) => right.some((other) => one.start < other.end && other.start < one.end));
}

function disjoint(fixes: readonly ShorterFix[]): ShorterFix[] {
  return fixes.filter((fix) =>
    fixes.every((other) => other === fix || !overlaps(fix.edits, other.edits)),
  );
}

function switchesIn(root: Node): Switch[] {
  return [...depthFirst(root, (node: Node) => node.namedChildren)]
    .filter(({ type }) => SWITCHES.has(type))
    .map(switchOf)
    .filter((owner) => owner !== undefined);
}

export function switchLabelFixes(grammar: Grammar, source: Source): ShorterFix[] {
  const tree = grammar.parser.parse(source.text);
  if (tree === null) {
    return [];
  }
  try {
    const fixes = switchesIn(tree.rootNode).flatMap((owner) =>
      classesOf(owner)
        .map((arms) => fixOf(owner, arms, source))
        .filter((fix) => fix !== undefined),
    );
    return disjoint(fixes);
  } finally {
    tree.delete();
  }
}
