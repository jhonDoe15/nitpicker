import { requiredText } from '../../../../scripts/json/fields.mts';
import { capture } from '../../common/matches.mts';
import type { Language, Occurrence } from '../../common/types.mts';
import type { SourceComment } from '../masking/lines.mts';
import { maskSource } from '../masking/mask.mts';
import { closingBracket, lineOfIndex, nextCode } from '../text.mts';

type CommentRule = { kind: string; pattern: RegExp };

type Marker = { kind: string; line: number; part: string; code: string };

type MarkerInput = { masked: string; text: string };

type Annotation = { name: string; start: number; nameEnd: number; listEnd?: number };

function trimmed(text: string): string[] {
  return [text.trim()];
}

function hashParts(text: string): string[] {
  return text.split('#').map((part) => part.trim());
}

const PYTHON_COMMENTS: readonly CommentRule[] = [
  { kind: 'noqa', pattern: /^(?:ruff:\s*|flake8:\s*)?noqa\b/iu },
  { kind: 'type-ignore', pattern: /^type:\s*ignore\b/u },
  {
    kind: 'pyright-ignore',
    pattern: /^(?:based)?pyright:\s*(?:ignore|basic|standard|off|\w+\s*=\s*(?:false|none))/iu,
  },
  {
    kind: 'mypy-config',
    pattern: new RegExp(
      [
        String.raw`^mypy:\s*(?:ignore[-_]errors|disable[-_]error[-_]code|allow[-_]|`,
        String.raw`no[-_]|check[-_]untyped[-_]defs\s*=\s*(?:false|0)|follow[-_]imports\s*=\s*(?:skip|`,
        String.raw`silent))`,
      ].join(''),
      'iu',
    ),
  },
  { kind: 'pragma-no-cover', pattern: /^pragma:\s*no\s*(?:cover|branch)\b/iu },
  { kind: 'pragma-no-mutate', pattern: /^pragma:\s*no\s*mutate\b/iu },
  { kind: 'fmt-off', pattern: /^(?:fmt|black|yapf|isort):\s*(?:off|skip|disable)/iu },
  {
    kind: 'tool-suppression',
    pattern: new RegExp(
      [
        String.raw`^(?:pylint:\s*(?:disable|skip-file)|pytype:\s*(?:disable|skip-file)|`,
        String.raw`nosec\b|nosemgrep|pyre-(?:ignore|fixme|unsafe))`,
      ].join(''),
      'iu',
    ),
  },
];
const JVM_COMMENTS: readonly CommentRule[] = [
  { kind: 'nopmd', pattern: /\bNOPMD\b/u },
  { kind: 'checkstyle-suppression', pattern: /\bCHECKSTYLE[.:]\s*(?:OFF|SUPPRESS)\b/iu },
  { kind: 'ktlint-disable', pattern: /\bktlint[-:]disable\b/u },
  { kind: 'fmt-off', pattern: /(?:@formatter:off|spotless:off)/u },
  { kind: 'tool-suppression', pattern: /\bNOSONAR\b/u },
];
const COMMENTS: Readonly<
  Record<Language, { patterns: readonly CommentRule[]; parts: (text: string) => string[] }>
> = {
  python: { patterns: PYTHON_COMMENTS, parts: hashParts },
  java: { patterns: JVM_COMMENTS, parts: trimmed },
  kotlin: { patterns: JVM_COMMENTS, parts: trimmed },
};

const PYTHON_CODE = [
  { kind: 'no-type-check', pattern: /@\s*(?:\w+\.)*no_type_check\b/gu },
  {
    kind: 'test-collection',
    pattern: new RegExp(
      [
        String.raw`\bcollect_ignore(?:_glob)?\b|\bpytest_ignore_collect\b|\bpytest_deselected\b|`,
        String.raw`\badd_marker\s*\(\s*(?:pytest\.mark\.)?(?:skip|xfail)\b`,
      ].join(''),
      'gu',
    ),
  },
];

const ANNOTATIONS = new Map([
  ['SuppressWarnings', 'suppress-warnings'],
  ['Suppress', 'suppress'],
  ['SuppressFBWarnings', 'suppress-fb-warnings'],
  ['NullUnmarked', 'null-unmarked'],
]);
const NAMES = 'SuppressWarnings|SuppressFBWarnings|Suppress|NullUnmarked';
const ANNOTATION = new RegExp(String.raw`@(?:\w+:)?(?:[a-z]\w*\.)*(${NAMES})\b`, 'gu');
const LISTED = new RegExp(String.raw`(?<![\w.@])(?:[a-z]\w*\.)*(${NAMES})\b`, 'gu');
const LIST_START = /@(?:\w+:)?\[/gu;
const ALLOWED = /^@(?:java\.lang\.)?SuppressWarnings\(\s*"PMD\.SpringDataNativeQuery"\s*\)$/u;

function collapse(text: string): string {
  return text.replaceAll(/\s+/gu, ' ').trim();
}

function codeAfter(masked: string, from: number): string {
  const start = nextCode(masked, from);
  const end = masked.slice(start).search(/[{=;]/u);
  return collapse(masked.slice(start, end === -1 ? start + 80 : start + end)).slice(0, 80);
}

function annotationAt({
  masked,
  text,
  start,
  nameEnd,
}: MarkerInput & { start: number; nameEnd: number }): { part: string; end: number } {
  const open = nextCode(masked, nameEnd);
  const end = masked[open] === '(' ? Math.max(closingBracket(masked, open) + 1, nameEnd) : nameEnd;
  return { part: collapse(text.slice(start, end)), end };
}

function annotationMarkers({ masked, text }: MarkerInput): Marker[] {
  const named = [...masked.matchAll(ANNOTATION)].map((match): Annotation => ({
    name: capture(match, 1),
    start: match.index,
    nameEnd: match.index + match[0].length,
  }));
  const listed = [...masked.matchAll(LIST_START)].flatMap((start) => {
    const open = start.index + start[0].length - 1;
    const close = closingBracket(masked, open);
    const inside = masked.slice(open, close === -1 ? undefined : close);
    return [...inside.matchAll(LISTED)].map((match): Annotation => ({
      name: capture(match, 1),
      start: open + match.index,
      nameEnd: open + match.index + match[0].length,
      listEnd: close + 1,
    }));
  });
  return [...named, ...listed]
    .map((found) => ({ found, ...annotationAt({ masked, text, ...found }) }))
    .filter(({ part }) => !ALLOWED.test(part))
    .map(({ found, part, end }) => ({
      kind: requiredText(ANNOTATIONS.get(found.name), 'annotation kind'),
      line: lineOfIndex(text, found.start),
      part,
      code: codeAfter(masked, found.listEnd ?? end),
    }));
}

function pythonCodeMarkers({ masked }: MarkerInput): Marker[] {
  return PYTHON_CODE.flatMap(({ kind, pattern }) =>
    [...masked.matchAll(pattern)].map((match) => ({
      kind,
      line: lineOfIndex(masked, match.index),
      part: match[0],
      code: '',
    })),
  );
}

const CODE_MARKERS: Readonly<Record<Language, (input: MarkerInput) => Marker[]>> = {
  python: pythonCodeMarkers,
  java: annotationMarkers,
  kotlin: annotationMarkers,
};

function commentMarkers({
  language,
  comments,
  masked,
}: {
  language: Language;
  comments: readonly SourceComment[];
  masked: string;
}): Marker[] {
  const lines = masked.split('\n');
  const { patterns, parts } = COMMENTS[language];
  return comments.flatMap((comment) =>
    patterns.flatMap(({ kind, pattern }) =>
      parts(comment.text)
        .filter((part) => pattern.test(part))
        .map((part) => ({
          kind,
          line: comment.line,
          part,
          code: collapse(lines[comment.line - 1] ?? ''),
        })),
    ),
  );
}

export function suppressionsIn(language: Language, text: string): Occurrence[] {
  const { masked, comments } = maskSource(language, text);
  const markers = [
    ...commentMarkers({ language, comments, masked }),
    ...CODE_MARKERS[language]({ masked, text }),
  ];
  return markers.map(({ kind, line, part, code }) => ({
    kind,
    line,
    detail: part,
    key: `${kind}|${part}|${code}`,
  }));
}
