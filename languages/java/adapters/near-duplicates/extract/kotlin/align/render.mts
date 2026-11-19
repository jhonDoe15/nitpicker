import type { Node } from 'web-tree-sitter';
import type { Edit, NamedValueHole, ValueHole } from '../../../extract-types.mts';
import { helperNameFor, indentOf, nameHoles, withReplacements } from '../../../jvm-views.mts';
import { codeParts, droppedComments, present } from '../../syntax.mts';
import { parameterNodes } from '../syntax.mts';

const STEP = '    ';
const NUMBER = 'number';
const STEMS: Readonly<Record<string, string>> = {
  String: 'text',
  Int: NUMBER,
  Long: NUMBER,
  Double: NUMBER,
  Float: NUMBER,
  Boolean: 'flag',
  Char: 'symbol',
};

export type ExtractedFunction = {
  readonly name: string;
  readonly holes: readonly NamedValueHole[];
  readonly taken: ReadonlySet<string>;
};

export function namedHelper(
  { label, holes }: { label: string; holes: readonly ValueHole[] },
  taken: ReadonlySet<string>,
): ExtractedFunction | undefined {
  const name = helperNameFor(label, taken);
  const named =
    name === undefined
      ? undefined
      : nameHoles(holes, new Set([...taken, name]), ({ type }) => STEMS[type]);
  return name === undefined || named === undefined
    ? undefined
    : { name, holes: named, taken: new Set([...taken, name, ...named.map((hole) => hole.name)]) };
}

export function holeArguments(holes: readonly NamedValueHole[], side: number): string[] {
  return holes.map(({ occurrences }) => {
    const [first] = occurrences;
    return side === 0 ? present(first).a.text : present(first).b.text;
  });
}

export function holeParameters(holes: readonly NamedValueHole[]): string[] {
  return holes.map(({ name, type }) => `${name}: ${type}`);
}

export function replacedText(
  node: { readonly startIndex: number; readonly endIndex: number },
  text: string,
  holes: readonly NamedValueHole[],
): string {
  return withReplacements(
    text.slice(node.startIndex, node.endIndex),
    holes.flatMap(({ name, occurrences }) =>
      occurrences.map(({ a }) => ({
        start: a.startIndex - node.startIndex,
        end: a.endIndex - node.startIndex,
        text: name,
      })),
    ),
  );
}

export function parameterTexts(fn: Node): string[] {
  return parameterNodes(fn).map(({ text }) => text);
}

export function ownArguments(fn: Node): string[] {
  return parameterNodes(fn).map((parameter) => present(codeParts(parameter)[0]).text);
}

export function innerIndent(block: Node, text: string, base: string): string {
  const first = codeParts(block).find(({ type }) => type !== '{' && type !== '}');
  return first === undefined ? `${base}${STEP}` : indentOf(text, first.startIndex);
}

export function movedComments(first: Node, second: Node): string[] {
  return droppedComments(
    [first, second].map((root) => ({ root, from: root.startIndex, to: root.endIndex })),
  ).map((node) => node.text);
}

export function insertionAfter(fn: Node, helper: string, text: string): Edit {
  const at = fn.endIndex;
  return { start: at, end: at, text: `\n\n${indentOf(text, fn.startIndex)}${helper}` };
}
