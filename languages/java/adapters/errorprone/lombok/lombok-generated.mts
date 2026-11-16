import { existsSync } from 'node:fs';
import path from 'node:path';
import { escapeRegExp as escapeRegExpUntyped } from '../../../../../shared/paths/glob.mjs';
import { fieldOf } from '../../../../../shared/values/readers.mts';

const escapeRegExp: (value: string) => string = escapeRegExpUntyped;

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

function imports(text: string): { single: Map<string, string>; onDemand: string[] } {
  const single = new Map<string, string>();
  const onDemand: string[] = [];
  for (const match of text.matchAll(IMPORT)) {
    const owner = (match[1] ?? '').replaceAll(/\s/gu, '').replace(/\.$/u, '');
    const simple = match[2] ?? '';
    if (simple === '*') {
      onDemand.push(owner);
    } else {
      single.set(simple, `${owner}.${simple}`);
    }
  }
  return { single, onDemand };
}

function declaredInPackage(simpleName: string, text: string, file: unknown): boolean {
  const declared = new RegExp(
    `\\b(?:class|interface|enum|record)\\s+${escapeRegExp(simpleName)}\\b`,
    'u',
  );
  if (declared.test(text)) {
    return true;
  }
  if (typeof file !== 'string') {
    return false;
  }
  const directory = path.resolve(path.dirname(file));
  const sibling = path.resolve(directory, `${simpleName}.java`);
  if (!sibling.startsWith(directory + path.sep)) {
    return false;
  }
  return existsSync(sibling);
}

function candidates(name: string, text: string, file: unknown): string[] {
  const [first = '', ...rest] = name.split('.');
  const nested = rest.length === 0 ? '' : `.${rest.join('.')}`;
  const { single, onDemand } = imports(text);
  if (single.has(first)) {
    return [`${single.get(first) ?? ''}${nested}`];
  }
  if (rest.length === 0 && declaredInPackage(first, text, file)) {
    return [];
  }
  return [name, ...onDemand.map((owner) => `${owner}.${name}`)];
}

function inComment(text: string, position: number): boolean {
  const lineStart = text.lastIndexOf('\n', position - 1) + 1;
  return COMMENT_BEFORE.test(text.slice(lineStart, position));
}

export function lombokAnnotationAt(
  text: string,
  position: number,
  file?: unknown,
): string | undefined {
  const match = ANNOTATION.exec(text.slice(position));
  if (match === null || inComment(text, position)) {
    return undefined;
  }
  const name = (match[1] ?? '').replaceAll(/\s/gu, '');
  return candidates(name, text, file).find((candidate) => LOMBOK_ANNOTATIONS.has(candidate));
}

function onlyInGeneratedCode(message: string, annotation: string): boolean {
  const check = CHECK.exec(message)?.[1];
  if (check === 'NullAway') {
    return GENERATED_NULLAWAY.test(message);
  }
  return (
    check !== undefined &&
    (GENERATED_CODE_CHECKS.has(check) || GENERATED_AT.get(annotation)?.has(check) === true)
  );
}

export function isLombokGenerated(diagnostic: unknown, text: unknown): boolean {
  const position = fieldOf(diagnostic, 'position');
  const message = fieldOf(diagnostic, 'message');
  if (
    typeof position !== 'number' ||
    !Number.isInteger(position) ||
    position < 0 ||
    typeof message !== 'string'
  ) {
    return false;
  }
  const annotation = lombokAnnotationAt(String(text), position, fieldOf(diagnostic, 'file'));
  return annotation !== undefined && onlyInGeneratedCode(message, annotation);
}
