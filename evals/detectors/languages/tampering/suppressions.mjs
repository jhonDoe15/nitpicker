import { maskSource } from '../masking/mask.mjs';
import { closingBracket, lineOfIndex, nextCode } from '../text.mjs';

const trimmed = (text) => [text.trim()];
const hashParts = (text) => text.split('#').map((part) => part.trim());

// What each marker in a Python comment turns off, found at the start of the comment or after
// another `#` in it (`# type: ignore  # noqa`).
const PYTHON_COMMENTS = [
  { kind: 'noqa', pattern: /^(?:ruff:\s*|flake8:\s*)?noqa\b/iu },
  { kind: 'type-ignore', pattern: /^type:\s*ignore\b/u },
  {
    kind: 'pyright-ignore',
    pattern: /^(?:based)?pyright:\s*(?:ignore|basic|standard|off|\w+\s*=\s*(?:false|none))/iu,
  },
  {
    kind: 'mypy-config',
    pattern:
      /^mypy:\s*(?:ignore[-_]errors|disable[-_]error[-_]code|allow[-_]|no[-_]|check[-_]untyped[-_]defs\s*=\s*(?:false|0)|follow[-_]imports\s*=\s*(?:skip|silent))/iu,
  },
  { kind: 'pragma-no-cover', pattern: /^pragma:\s*no\s*(?:cover|branch)\b/iu },
  { kind: 'pragma-no-mutate', pattern: /^pragma:\s*no\s*mutate\b/iu },
  { kind: 'fmt-off', pattern: /^(?:fmt|black|yapf|isort):\s*(?:off|skip|disable)/iu },
  {
    kind: 'tool-suppression',
    pattern:
      /^(?:pylint:\s*(?:disable|skip-file)|pytype:\s*(?:disable|skip-file)|nosec\b|nosemgrep|pyre-(?:ignore|fixme|unsafe))/iu,
  },
];
const JVM_COMMENTS = [
  { kind: 'nopmd', pattern: /\bNOPMD\b/u },
  { kind: 'checkstyle-suppression', pattern: /\bCHECKSTYLE[.:]\s*(?:OFF|SUPPRESS)\b/iu },
  { kind: 'ktlint-disable', pattern: /\bktlint[-:]disable\b/u },
  { kind: 'fmt-off', pattern: /(?:@formatter:off|spotless:off)/u },
  { kind: 'tool-suppression', pattern: /\bNOSONAR\b/u },
];
const COMMENTS = {
  python: { patterns: PYTHON_COMMENTS, parts: hashParts },
  java: { patterns: JVM_COMMENTS, parts: trimmed },
  kotlin: { patterns: JVM_COMMENTS, parts: trimmed },
};

const PYTHON_CODE = [
  { kind: 'no-type-check', pattern: /@\s*(?:\w+\.)*no_type_check\b/gu },
  {
    kind: 'test-collection',
    pattern:
      /\bcollect_ignore(?:_glob)?\b|\bpytest_ignore_collect\b|\bpytest_deselected\b|\badd_marker\s*\(\s*(?:pytest\.mark\.)?(?:skip|xfail)\b/gu,
  },
];

const ANNOTATIONS = new Map([
  ['SuppressWarnings', 'suppress-warnings'],
  ['Suppress', 'suppress'],
  ['SuppressFBWarnings', 'suppress-fb-warnings'],
  ['NullUnmarked', 'null-unmarked'],
]);
const NAMES = 'SuppressWarnings|SuppressFBWarnings|Suppress|NullUnmarked';
// An annotation may be qualified (`@java.lang.SuppressWarnings`), carry Kotlin's use-site target
// (`@file:Suppress`, `@get:Suppress`) or sit in a list (`@[Foo Suppress("x")]`, `@file:[Suppress]`).
const ANNOTATION = new RegExp(String.raw`@(?:\w+:)?(?:[a-z]\w*\.)*(${NAMES})\b`, 'gu');
const LISTED = new RegExp(String.raw`(?<![\w.@])(?:[a-z]\w*\.)*(${NAMES})\b`, 'gu');
const LIST_START = /@(?:\w+:)?\[/gu;
// The one marker the preset allows: native SQL on a Spring Data repository method.
const ALLOWED = /^@(?:java\.lang\.)?SuppressWarnings\(\s*"PMD\.SpringDataNativeQuery"\s*\)$/u;

const collapse = (text) => text.replaceAll(/\s+/gu, ' ').trim();

// The code a marker applies to: the rest of its line, or what follows an annotation.
function codeAfter(masked, from) {
  const start = nextCode(masked, from);
  const end = masked.slice(start).search(/[{=;]/u);
  return collapse(masked.slice(start, end === -1 ? start + 80 : start + end)).slice(0, 80);
}

// The annotation, with its argument list when it has one, on one line, and where it ends.
function annotationAt({ masked, text, start, nameEnd }) {
  const open = nextCode(masked, nameEnd);
  const end = masked[open] === '(' ? Math.max(closingBracket(masked, open) + 1, nameEnd) : nameEnd;
  return { part: collapse(text.slice(start, end)), end };
}

function annotationMarkers({ masked, text }) {
  const named = [...masked.matchAll(ANNOTATION)].map((match) => ({
    name: match[1],
    start: match.index,
    nameEnd: match.index + match[0].length,
  }));
  const listed = [...masked.matchAll(LIST_START)].flatMap((start) => {
    const open = start.index + start[0].length - 1;
    const close = closingBracket(masked, open);
    const inside = masked.slice(open, close === -1 ? undefined : close);
    return [...inside.matchAll(LISTED)].map((match) => ({
      name: match[1],
      start: open + match.index,
      nameEnd: open + match.index + match[0].length,
      listEnd: close + 1,
    }));
  });
  return [...named, ...listed]
    .map((found) => ({ found, ...annotationAt({ masked, text, ...found }) }))
    .filter(({ part }) => !ALLOWED.test(part))
    .map(({ found, part, end }) => ({
      kind: ANNOTATIONS.get(found.name),
      line: lineOfIndex(text, found.start),
      part,
      code: codeAfter(masked, found.listEnd ?? end),
    }));
}

function pythonCodeMarkers({ masked }) {
  return PYTHON_CODE.flatMap(({ kind, pattern }) =>
    [...masked.matchAll(pattern)].map((match) => ({
      kind,
      line: lineOfIndex(masked, match.index),
      part: match[0],
      code: '',
    })),
  );
}

const CODE_MARKERS = {
  python: pythonCodeMarkers,
  java: annotationMarkers,
  kotlin: annotationMarkers,
};

function commentMarkers({ language, comments, masked }) {
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
          code: collapse(lines[comment.line - 1]),
        })),
    ),
  );
}

/**
 * Every suppression marker in a Python, Java or Kotlin file, found in real comments and in code
 * (never inside a string): `{ kind, line, detail, key }`. The key holds the code the marker sits
 * on, so the same marker moved onto other code is a new one.
 *
 * Python: `noqa`, `type-ignore`, `pyright-ignore`, `mypy-config` (hyphen or underscore spelling),
 * `pragma-no-cover`, `pragma-no-mutate`, `fmt-off`, `tool-suppression` (`pylint: disable` and
 * `skip-file`, `nosec`, `nosemgrep`, `pytype`, `pyre-ignore`), `no-type-check` and
 * `test-collection` (`collect_ignore`, `pytest_ignore_collect`, a skip added by a hook). Java and
 * Kotlin: `suppress-warnings`, `suppress` (Kotlin's `@Suppress`), `suppress-fb-warnings`,
 * `null-unmarked` (qualified, with a use-site target or in a list), `nopmd`,
 * `checkstyle-suppression`, `ktlint-disable`, `fmt-off` and `tool-suppression`.
 */
export function suppressionsIn(language, text) {
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
