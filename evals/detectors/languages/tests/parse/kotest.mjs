import { closingBracket, lineOfIndex } from '../../text.mjs';
import { measureBody } from '../assertions.mjs';
import { rowCases } from './rows.mjs';

const SPEC_BASE =
  /:\s*(?:\w+\.)*(?:StringSpec|FunSpec|ShouldSpec|DescribeSpec|BehaviorSpec|WordSpec|FreeSpec|FeatureSpec|ExpectSpec)\b/u;
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

// Whether a string at `index` starts a statement, as the name of a test does.
const startsStatement = (masked, index) =>
  '{};(,'.includes(masked.slice(0, index).trimEnd().at(-1) ?? '{');

function keywordNodes({ masked, kept }) {
  return [...kept.matchAll(KEYWORD_CALL)]
    .filter((match) => masked[match.index] === kept[match.index])
    .map((match) => ({
      index: match.index,
      name: match[3],
      leaf: LEAF_WORD.test(match[2]),
      off: match[1] === 'x' || OFF.test(match[4] ?? ''),
      length: match[0].length,
    }));
}

function stringNodes({ masked, kept }) {
  return [...kept.matchAll(STRING_CALL)]
    .filter(
      (match) => masked[match.index] === kept[match.index] && startsStatement(masked, match.index),
    )
    .map((match) => ({
      index: match.index,
      name: match[1],
      leaf: match[2] === undefined && match[3] === undefined,
      off: OFF.test(match[4] ?? ''),
      length: match[0].length,
    }));
}

function withRanges(nodes, masked) {
  return nodes.flatMap((node) => {
    const brace = node.index + node.length - 1;
    const close = closingBracket(masked, brace);
    return close === -1 ? [] : [{ ...node, brace, close }];
  });
}

const encloses = (outer, inner) => outer.brace < inner.index && outer.close > inner.index;

/**
 * The tests of a Kotest spec (`StringSpec`, `FunSpec`, `ShouldSpec`, `DescribeSpec`,
 * `BehaviorSpec`, `WordSpec`, `FreeSpec`, `FeatureSpec`, `ExpectSpec`): every leaf `test("x") { }`,
 * `"x" { }`, `should`, `it`, `then`, `scenario` or `expect` block, keyed by its classes and the
 * containers (`context`, `describe`, `given`, `"x" - { }`, ...) around it. A leaf is skipped by an
 * `x` prefix, `.config(enabled = false)`, or the same on a container. Same fields as `parseJvmTests`.
 */
export function kotestTests({ views, scopes }) {
  const { masked, kept } = views;
  if (!SPEC_BASE.test(masked)) return [];
  const nodes = withRanges([...keywordNodes(views), ...stringNodes(views)], masked);
  return nodes
    .filter((node) => node.leaf)
    .map((leaf) => {
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
