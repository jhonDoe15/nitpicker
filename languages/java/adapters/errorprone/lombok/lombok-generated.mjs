const LOMBOK_ANNOTATIONS = new Set([
  ...[
    'AllArgsConstructor',
    'Builder',
    'Builder.Default',
    'Builder.ObtainVia',
    'Cleanup',
    'CustomLog',
    'Data',
    'EqualsAndHashCode',
    'EqualsAndHashCode.Exclude',
    'EqualsAndHashCode.Include',
    'Generated',
    'Getter',
    'Locked',
    'Locked.Read',
    'Locked.Write',
    'NoArgsConstructor',
    'NonNull',
    'RequiredArgsConstructor',
    'Setter',
    'Singular',
    'SneakyThrows',
    'Synchronized',
    'ToString',
    'ToString.Exclude',
    'ToString.Include',
    'Value',
    'With',
  ].map((name) => `lombok.${name}`),
  ...[
    'Accessors',
    'Delegate',
    'ExtensionMethod',
    'FieldDefaults',
    'FieldNameConstants',
    'FieldNameConstants.Exclude',
    'FieldNameConstants.Include',
    'Helper',
    'NonFinal',
    'PackagePrivate',
    'StandardException',
    'SuperBuilder',
    'Tolerate',
    'UtilityClass',
    'WithBy',
  ].map((name) => `lombok.experimental.${name}`),
  'lombok.extern.apachecommons.CommonsLog',
  'lombok.extern.flogger.Flogger',
  'lombok.extern.jackson.Jacksonized',
  'lombok.extern.java.Log',
  'lombok.extern.jbosslog.JBossLog',
  'lombok.extern.log4j.Log4j',
  'lombok.extern.log4j.Log4j2',
  'lombok.extern.slf4j.Slf4j',
  'lombok.extern.slf4j.XSlf4j',
]);
const GENERATED_CODE_CHECKS = new Set([
  'CheckReturnValue',
  'ExtendsObject',
  'PatternMatchingInstanceof',
  'RedundantNullCheck',
  'SuppressWarningsWithoutExplanation',
  'UnnecessarilyFullyQualified',
  'UnnecessarySemicolon',
  'UnrecognisedJavadocTag',
]);
const GENERATED_AT = new Map([
  ['lombok.experimental.FieldNameConstants', new Set(['PrivateConstructorForUtilityClass'])],
]);
const GENERATED_NULLAWAY =
  /^\[NullAway\] (?:passing @Nullable parameter|returning @Nullable expression)/u;
const CHECK = /^\[(\w+)\]/u;
const ANNOTATION = /^@\s*((?:\w+\s*\.\s*)*\w+)/u;
const COMMENT_BEFORE = /\/\/|\/\*|^\s*\*/u;
const IMPORT = /^\s*import\s+((?:\w+\s*\.\s*)*)(\w+|\*)\s*;/gmu;

function imports(text) {
  const single = new Map();
  const onDemand = [];
  for (const match of text.matchAll(IMPORT)) {
    const owner = match[1].replaceAll(/\s/gu, '').replace(/\.$/u, '');
    if (match[2] === '*') {
      onDemand.push(owner);
    } else {
      single.set(match[2], `${owner}.${match[2]}`);
    }
  }
  return { single, onDemand };
}

function candidates(name, text) {
  const [first, ...rest] = name.split('.');
  const nested = rest.length === 0 ? '' : `.${rest.join('.')}`;
  const { single, onDemand } = imports(text);
  if (single.has(first)) {
    return [`${single.get(first)}${nested}`];
  }
  return [name, ...onDemand.map((owner) => `${owner}.${name}`)];
}

function inComment(text, position) {
  const lineStart = text.lastIndexOf('\n', position - 1) + 1;
  return COMMENT_BEFORE.test(text.slice(lineStart, position));
}

export function lombokAnnotationAt(text, position) {
  const match = ANNOTATION.exec(text.slice(position));
  if (match === null || inComment(text, position)) {
    return undefined;
  }
  const name = match[1].replaceAll(/\s/gu, '');
  return candidates(name, text).find((candidate) => LOMBOK_ANNOTATIONS.has(candidate));
}

function onlyInGeneratedCode(message, annotation) {
  const check = CHECK.exec(message)?.[1];
  if (check === 'NullAway') {
    return GENERATED_NULLAWAY.test(message);
  }
  return GENERATED_CODE_CHECKS.has(check) || GENERATED_AT.get(annotation)?.has(check) === true;
}

export function isLombokGenerated(diagnostic, text) {
  const { position, message } = diagnostic;
  if (!Number.isInteger(position) || position < 0 || typeof message !== 'string') {
    return false;
  }
  const annotation = lombokAnnotationAt(text, position);
  return annotation !== undefined && onlyInGeneratedCode(message, annotation);
}
