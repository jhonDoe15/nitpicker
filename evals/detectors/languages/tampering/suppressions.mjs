import { closingBracket } from '../occurrences.mjs';
import { maskSource } from '../masking/mask.mjs';

// What each marker in a Python comment turns off, found at the start of the comment or after
// another `#` in it (`# type: ignore  # noqa`).
const PYTHON_COMMENTS = [
  { kind: 'noqa', pattern: /^(?:ruff:\s*|flake8:\s*)?noqa\b/iu },
  { kind: 'type-ignore', pattern: /^type:\s*ignore\b/u },
  {
    kind: 'pyright-ignore',
    pattern: /^(?:based)?pyright:\s*(?:ignore|basic|standard|off|\w+\s*=\s*(?:false|none))/iu,
  },
  { kind: 'mypy-config', pattern: /^mypy:\s*(?:ignore-errors|disable-error-code|allow-|no-)/u },
  { kind: 'pragma-no-cover', pattern: /^pragma:\s*no\s*(?:cover|branch)\b/iu },
  { kind: 'pragma-no-mutate', pattern: /^pragma:\s*no\s*mutate\b/iu },
  { kind: 'fmt-off', pattern: /^(?:fmt|black|yapf|isort):\s*(?:off|skip|disable)/iu },
  { kind: 'tool-suppression', pattern: /^(?:pylint:\s*disable|nosec\b|nosemgrep)/iu },
];
const JVM_COMMENTS = [
  { kind: 'nopmd', pattern: /\bNOPMD\b/u },
  { kind: 'checkstyle-suppression', pattern: /\bCHECKSTYLE[.:]\s*(?:OFF|SUPPRESS)\b/iu },
  { kind: 'ktlint-disable', pattern: /\bktlint[-:]disable\b/u },
  { kind: 'fmt-off', pattern: /(?:@formatter:off|spotless:off)/u },
  { kind: 'tool-suppression', pattern: /\bNOSONAR\b/u },
];
const PYTHON_CODE = [{ kind: 'no-type-check', pattern: /@\s*(?:\w+\.)*no_type_check\b/gu }];
// The annotation prefix is Kotlin's use-site target (`@file:Suppress`, `@get:Suppress`).
const ANNOTATIONS = new Map([
  ['SuppressWarnings', 'suppress-warnings'],
  ['Suppress', 'suppress'],
  ['SuppressFBWarnings', 'suppress-fb-warnings'],
  ['NullUnmarked', 'null-unmarked'],
]);
const ANNOTATION = /@(?:\w+:)?(SuppressWarnings|SuppressFBWarnings|Suppress|NullUnmarked)\b/gu;
// The one marker the preset allows: native SQL on a Spring Data repository method.
const ALLOWED = /^@SuppressWarnings\(\s*"PMD\.SpringDataNativeQuery"\s*\)$/u;

const textOf = (comment, python) =>
  python ? comment.text.split('#').map((part) => part.trim()) : [comment.text.trim()];

function commentMarkers(comments, python) {
  const patterns = python ? PYTHON_COMMENTS : JVM_COMMENTS;
  return comments.flatMap((comment) =>
    patterns.flatMap(({ kind, pattern }) =>
      textOf(comment, python)
        .filter((part) => pattern.test(part))
        .map((part) => ({ kind, line: comment.line, part })),
    ),
  );
}

const lineOfIndex = (text, index) => text.slice(0, index).split('\n').length;

// The annotation, with its argument list when it has one, on one line.
function annotationText({ masked, text, match }) {
  const nameEnd = match.index + match[0].length;
  const open = nameEnd + masked.slice(nameEnd).search(/\S|$/u);
  const end = masked[open] === '(' ? closingBracket(masked, open) + 1 : nameEnd;
  return text.slice(match.index, Math.max(end, nameEnd)).replaceAll(/\s+/gu, ' ');
}

function annotationMarkers(masked, text) {
  return [...masked.matchAll(ANNOTATION)]
    .map((match) => ({
      kind: ANNOTATIONS.get(match[1]),
      line: lineOfIndex(text, match.index),
      part: annotationText({ masked, text, match }),
    }))
    .filter((marker) => !ALLOWED.test(marker.part));
}

function pythonCodeMarkers(masked) {
  return PYTHON_CODE.flatMap(({ kind, pattern }) =>
    [...masked.matchAll(pattern)].map((match) => ({
      kind,
      line: lineOfIndex(masked, match.index),
      part: match[0],
    })),
  );
}

/**
 * Every suppression marker in a Python, Java or Kotlin file, found in real comments and in code
 * (never inside a string): `{ kind, line, detail, key }`.
 *
 * Python: `noqa`, `type-ignore`, `pyright-ignore`, `mypy-config`, `pragma-no-cover`,
 * `pragma-no-mutate`, `fmt-off`, `tool-suppression` and `no-type-check`. Java and Kotlin:
 * `suppress-warnings`, `suppress` (Kotlin's `@Suppress` and `@file:Suppress`),
 * `suppress-fb-warnings`, `null-unmarked`, `nopmd`, `checkstyle-suppression`, `ktlint-disable`,
 * `fmt-off` and `tool-suppression`.
 */
export function suppressionsIn(language, text) {
  const { masked, comments } = maskSource(language, text);
  const python = language === 'python';
  const markers = [
    ...commentMarkers(comments, python),
    ...(python ? pythonCodeMarkers(masked) : annotationMarkers(masked, text)),
  ];
  return markers.map(({ kind, line, part }) => ({
    kind,
    line,
    detail: part,
    key: `${kind}|${part}`,
  }));
}
