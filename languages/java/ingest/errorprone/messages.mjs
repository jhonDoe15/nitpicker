const SENTENCE_END = /[.?!:]$/u;
const REMOVE_LINE = 'to remove this line';
const GUAVA_ONLY = new RegExp(
  [
    String.raw`\bcom\.google\.common\b`,
    String.raw`\bImmutable(?:Collection|List|Map|Multimap|Set|SortedMap|SortedSet)\b`,
    String.raw`\b(?:Iterables|Iterators|Lists|Maps|Preconditions|Sets|Strings|Verify)\.`,
  ].join('|'),
  'u',
);
const JDK_FORMS = [
  [/\bVerifyException\b/gu, 'IllegalStateException'],
  [/\bImmutable(List|Set|Map)\.(of|copyOf)\(/gu, '$1.$2('],
];
const GUAVA_SUMMARIES = [
  [", and (Guava's) VerifyException.", '.'],
  [
    'IllegalArgumentException, IllegalStateException.',
    'IllegalArgumentException and IllegalStateException.',
  ],
  ['Prefer an ImmutableList,', 'Prefer an unmodifiable List (List.of),'],
];
const ALLOWED_FORMS = new Map([
  [
    'NullAway',
    'Annotate what may be null with the @Nullable the project already uses ' +
      "(JSpecify's org.jspecify.annotations.Nullable if it uses none) and check it before use; " +
      'otherwise give it a non-null value.',
  ],
  [
    'SuppressWarningsWithoutExplanation',
    'Explain this existing suppression in a comment next to it, saying why the warning is safe ' +
      'to ignore. This is not a reason to add suppressions: fix new warnings instead.',
  ],
  ['CheckReturnValue', 'Use the result, or make the method return void if callers do not need it.'],
  [
    'JavaTimeDefaultTimeZone',
    'Inject a Clock (or a ZoneId) and pass it, as in LocalDate.now(clock), so the zone is ' +
      'explicit and tests can fix the time.',
  ],
]);
const SUMMARIES = new Map([
  [
    'DefaultCharset',
    () =>
      "Implicit use of the default charset: what this reads or writes depends on the runtime's " +
      'settings and on the JDK version (JDK 18 made UTF-8 the default). Pass the charset explicitly.',
  ],
  [
    'JavaTimeDefaultTimeZone',
    (summary) => summary.replace(/ You must pass an explicit time-zone.*$/u, ''),
  ],
]);
const DROPPED_SUGGESTIONS = new Map([
  ['CheckReturnValue', () => true],
  ['JavaTimeDefaultTimeZone', () => true],
]);

function sentence(text) {
  return SENTENCE_END.test(text) ? text : `${text}.`;
}

function alternativesOf(suggestion) {
  const body = suggestion.replace(/^Did you mean /u, '').replace(/\?$/u, '');
  const removeLine = body === REMOVE_LINE || body.endsWith(` or ${REMOVE_LINE}`);
  const quoted = removeLine ? body.slice(0, -REMOVE_LINE.length).replace(/ or $/u, '') : body;
  if (quoted !== '' && !(quoted.startsWith("'") && quoted.endsWith("'"))) {
    return undefined;
  }
  const alternatives = quoted === '' ? [] : quoted.slice(1, -1).split("' or '");
  return { alternatives, removeLine };
}

function withJdkForms(alternative, guava) {
  if (guava) {
    return alternative;
  }
  const rewritten = JDK_FORMS.reduce(
    (text, [pattern, form]) => text.replace(pattern, form),
    alternative,
  );
  return GUAVA_ONLY.test(rewritten) ? undefined : rewritten;
}

function cleanSuggestion(check, suggestion, guava) {
  const parsed = alternativesOf(suggestion);
  if (parsed === undefined) {
    return suggestion;
  }
  const dropped = DROPPED_SUGGESTIONS.get(check) ?? (() => false);
  const alternatives = parsed.alternatives
    .filter((alternative) => /[\p{L}\p{N}]/u.test(alternative) && !dropped(alternative))
    .map((alternative) => withJdkForms(alternative, guava))
    .filter((alternative) => alternative !== undefined)
    .map((alternative) => `'${alternative}'`);
  const choices = [...alternatives, ...(parsed.removeLine ? [REMOVE_LINE] : [])];
  return choices.length === 0 ? undefined : `Did you mean ${choices.join(' or ')}?`;
}

function readableSummary(check, summary, guava) {
  const rewritten = (SUMMARIES.get(check) ?? ((text) => text))(summary);
  return guava
    ? rewritten
    : GUAVA_SUMMARIES.reduce((text, [from, to]) => text.replace(from, to), rewritten);
}

export function errorProneAllowedForm(check) {
  return ALLOWED_FORMS.get(check);
}

export function errorProneMessage({ check, summary, suggestion }, { guava = true } = {}) {
  const cleaned = suggestion === undefined ? undefined : cleanSuggestion(check, suggestion, guava);
  const parts = [readableSummary(check, summary, guava), ALLOWED_FORMS.get(check), cleaned];
  const present = parts.filter((part) => part !== undefined);
  return present.length === 1 ? present[0] : present.map((part) => sentence(part)).join(' ');
}
