import { capture } from '../../../common/matches.mts';
import type { MaskedViews, ParsedTest, TypeScope } from '../../../common/types.mts';
import { closingBracket, lineOfIndex } from '../../text.mts';
import { measureBody } from '../assertions.mts';
import { rowCases } from './rows.mts';

const SPEC_BASE = new RegExp(
  [
    String.raw`:\s*(?:\w+\.)*(?:StringSpec|FunSpec|ShouldSpec|DescribeSpec|`,
    String.raw`BehaviorSpec|WordSpec|FreeSpec|FeatureSpec|ExpectSpec)\b`,
  ].join(''),
  'u',
);
const LEAVES = 'test|should|it|then|Then|scenario|expect';
const CONTAINERS = 'context|describe|given|Given|When|And|and|feature|when';
const CONFIG = String.raw`(?:\.\s*config\s*\(([^)]*)\))?`;
const KEYWORD_CALL = new RegExp(
  String.raw`(?<![\w.])(x?)(${LEAVES}|${CONTAINERS})\s*\(\s*"([^"\n]*)"\s*\)\s*${CONFIG}\s*\{`,
  'gu',
);
const STRING_CALL = new RegExp(
  String.raw`(?<![\w"])"([^"\n]*)"\s*(?:(-)|(should|When|Given|Then|when|And)\b)?\s*${CONFIG}\s*\{`,
  'gu',
);
const LEAF_WORD = new RegExp(`^(?:${LEAVES})$`, 'u');
const OFF = /\benabled\s*=\s*(?!true\b)/u;

type SpecNode = { index: number; name: string; leaf: boolean; off: boolean; length: number };

type RangedNode = SpecNode & { brace: number; close: number };

function startsStatement(masked: string, index: number): boolean {
  return '{};(,'.includes(masked.slice(0, index).trimEnd().at(-1) ?? '{');
}

function keywordNodes({ masked, kept }: MaskedViews): SpecNode[] {
  return [...kept.matchAll(KEYWORD_CALL)]
    .filter((match) => masked[match.index] === kept[match.index])
    .map((match) => ({
      index: match.index,
      name: capture(match, 3),
      leaf: LEAF_WORD.test(capture(match, 2)),
      off: match[1] === 'x' || OFF.test(match[4] ?? ''),
      length: match[0].length,
    }));
}

function stringNodes({ masked, kept }: MaskedViews): SpecNode[] {
  return [...kept.matchAll(STRING_CALL)]
    .filter(
      (match) => masked[match.index] === kept[match.index] && startsStatement(masked, match.index),
    )
    .map((match) => ({
      index: match.index,
      name: capture(match, 1),
      leaf: match[2] === undefined && match[3] === undefined,
      off: OFF.test(match[4] ?? ''),
      length: match[0].length,
    }));
}

function withRanges(nodes: readonly SpecNode[], masked: string): RangedNode[] {
  return nodes.flatMap((node) => {
    const brace = node.index + node.length - 1;
    const close = closingBracket(masked, brace);
    return close === -1 ? [] : [{ ...node, brace, close }];
  });
}

function encloses(outer: RangedNode, inner: SpecNode): boolean {
  return outer.brace < inner.index && outer.close > inner.index;
}

export function kotestTests({
  views,
  scopes,
}: {
  views: MaskedViews;
  scopes: readonly TypeScope[];
}): ParsedTest[] {
  const { masked, kept } = views;
  if (!SPEC_BASE.test(masked)) return [];
  const nodes = withRanges([...keywordNodes(views), ...stringNodes(views)], masked);
  return nodes
    .filter((node) => node.leaf)
    .map((leaf): ParsedTest => {
      const containers = nodes
        .filter((node) => !node.leaf && encloses(node, leaf))
        .toSorted((left, right) => left.index - right.index);
      const classes = scopes.filter((scope) => scope.open < leaf.index && scope.close > leaf.index);
      const body = {
        masked: masked.slice(leaf.brace + 1, leaf.close),
        kept: kept.slice(leaf.brace + 1, leaf.close),
      };
      const measured = measureBody('kotlin', body);
      const disabled = [leaf, ...containers].some((node) => node.off);
      return {
        key: [...classes, ...containers, leaf].map((entry) => entry.name).join('.'),
        line: lineOfIndex(masked, leaf.index),
        shape: body.kept
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== '')
          .join('\n'),
        source: kept.slice(leaf.index, leaf.close + 1),
        ...measured,
        skipped:
          measured.skipped ||
          disabled ||
          classes.some((scope) => /@(?:\w+\.)*(?:Ignored|Disabled)\b/u.test(scope.header)),
        rows: rowCases(body.masked),
        collected: true,
        family: 'other',
      };
    });
}
