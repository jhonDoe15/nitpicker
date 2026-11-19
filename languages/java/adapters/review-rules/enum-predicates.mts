import { simpleName } from '../kotlin/review-rules/main/service-lookups/lookup-resolution.mts';
import path from 'node:path';
import { textOf } from '../../../../shared/values/readers.mts';
import {
  expressionAt,
  importsOf,
  javaFilesUnder,
  offsetOf,
  packageOf,
  readJavaSource,
  staticImportsOf,
} from './java-sources.mts';
import { lazy as lazyUntyped } from '../../../../shared/rules/finding-helpers.mjs';
import type { JavaFinding } from '../typed/java-values.mts';
import type { StaticImport } from './review-types.mts';
import {
  declaredTypes,
  listedLabels,
  switchBody,
  type SwitchLabels,
} from './switch-labels/switch-labels.mts';

type EnumDeclaration = { readonly packageName: string; readonly constants: string[] };
type Enums = Map<string, EnumDeclaration[]>;
type EnumSource = { readonly text: string; readonly enums: () => Enums };

const lazy: (read: () => Enums) => () => Enums = lazyUntyped;

export const ENUM_PREDICATE_RULE = 'ExhaustiveEnumPredicate';
const GENERIC_ENUM = 'an enum of the project';
const MINIMUM_CONSTANTS = 3;
const MINIMUM_LISTED = 2;
const ENUM_HEADER = /\benum\s+(\w+)/gu;
const ANNOTATION = /@[\w.]+(?:\s*\([^()]*\))?/gu;
const IDENTIFIER = /^[A-Za-z_$][\w$]*/u;
const DOTTED_NAME = /[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)+/gu;
const TYPE_NAME = /^[A-Z]/u;
const TYPE_AND_CONSTANT = 2;
const BARE_CONSTANT = /(?<![\w$.])([A-Z][A-Z0-9_]*)(?![\w$]|\s*\(|\s*\.(?!\s*equals\s*\())/gu;
const CALLED = /^\s*\(/u;
const SWITCH_START = /^switch\s*\(/u;

function splitTopLevel(text: string): string[] {
  const parts = [''];
  let depth = 0;
  for (const character of text) {
    if (depth === 0 && (character === ';' || character === '}')) {
      break;
    }
    depth += '({'.includes(character) ? 1 : 0;
    depth -= ')}'.includes(character) ? 1 : 0;
    if (depth === 0 && character === ',') {
      parts.push('');
    } else {
      parts[parts.length - 1] = `${parts[parts.length - 1] ?? ''}${character}`;
    }
  }
  return parts;
}

function constantsOf(body: string): string[] {
  return splitTopLevel(body)
    .map((part) => IDENTIFIER.exec(part.replaceAll(ANNOTATION, ' ').trim())?.[0])
    .filter((name): name is string => name !== undefined);
}

function enumBody(text: string, from: number): string | undefined {
  const open = text.indexOf('{', from);
  return open < 0 || text.slice(from, open).includes(';') ? undefined : text.slice(open + 1);
}

export function readEnums(projectRoot: string): Enums {
  const enums: Enums = new Map();
  for (const file of javaFilesUnder(projectRoot)) {
    const text = readJavaSource(file) ?? '';
    for (const match of text.matchAll(ENUM_HEADER)) {
      const body = enumBody(text, match.index + match[0].length);
      const declared = { packageName: packageOf(text), constants: constantsOf(body ?? '') };
      const name = match[1] ?? '';
      enums.set(name, [...(enums.get(name) ?? []), ...(body === undefined ? [] : [declared])]);
    }
  }
  return enums;
}

function constantsKey(declared: EnumDeclaration | undefined): string {
  return [...(declared?.constants ?? [])].sort().join(',');
}

function sameConstants(declarations: readonly EnumDeclaration[]): EnumDeclaration | undefined {
  const [first] = declarations;
  return declarations.every((declared) => constantsKey(declared) === constantsKey(first))
    ? first
    : undefined;
}

function declarationFor(
  declarations: readonly EnumDeclaration[] | undefined,
  text: string,
  name: string,
): EnumDeclaration | undefined {
  if (declarations === undefined) {
    return undefined;
  }
  const imported = importsOf(text).find((entry) => entry.endsWith(`.${name}`));
  const visible = declarations.filter(
    ({ packageName }) =>
      packageName === packageOf(text) ||
      (imported !== undefined && imported.startsWith(`${packageName}.`)),
  );
  return sameConstants(visible.length > 0 ? visible : declarations);
}

function staticOwner(
  imports: readonly StaticImport[],
  name: string,
  enums: () => Enums,
): string | undefined {
  const single = imports.find((entry) => entry.name === name);
  if (single !== undefined) {
    return simpleName(single.owner);
  }
  const owners = imports
    .filter((entry) => entry.name === '*')
    .map((entry) => simpleName(entry.owner))
    .filter((type) => (enums().get(type) ?? []).some(({ constants }) => constants.includes(name)));
  return owners.length === 1 ? owners[0] : undefined;
}

function qualifiedConstants(expression: string): string[][] {
  return [...expression.matchAll(DOTTED_NAME)]
    .map(({ 0: name, index }) => {
      const parts = name.split('.').map((part) => part.trim());
      const called = CALLED.test(expression.slice(index + name.length));
      return (called ? parts.slice(0, -1) : parts).slice(-TYPE_AND_CONSTANT);
    })
    .filter((parts) => parts.length === TYPE_AND_CONSTANT && TYPE_NAME.test(parts[0] ?? ''));
}

function importedConstants(
  expression: string,
  { text, enums }: EnumSource,
): [string | undefined, string][] {
  const imports = staticImportsOf(text);
  if (imports.length === 0) {
    return [];
  }
  return [...expression.matchAll(BARE_CONSTANT)]
    .map(([, name = '']): [string | undefined, string] => [staticOwner(imports, name, enums), name])
    .filter(([type]) => type !== undefined);
}

function comparedConstants(
  expression: string,
  source: EnumSource,
): Map<string | undefined, Set<string>> {
  const byType = new Map<string | undefined, Set<string>>();
  for (const [type, constant = ''] of [
    ...qualifiedConstants(expression),
    ...importedConstants(expression, source),
  ]) {
    byType.set(type, new Set([...(byType.get(type) ?? []), constant]));
  }
  return byType;
}

function isPartialOf(
  declared: EnumDeclaration | undefined,
  compared: ReadonlySet<string | undefined>,
): boolean {
  const constants = declared?.constants ?? [];
  return (
    compared.size >= MINIMUM_LISTED &&
    constants.length >= MINIMUM_CONSTANTS &&
    compared.size < constants.length &&
    [...compared].every((constant) => constants.includes(textOf(constant)))
  );
}

function switchCandidates(
  { text, start, enums }: EnumSource & { readonly start: number },
  labels: SwitchLabels,
): (string | undefined)[] {
  const qualified = new Set(
    labels.filter((parts) => parts.length > 1).map((parts) => parts.at(-TYPE_AND_CONSTANT)),
  );
  const subject = expressionAt(text, text.indexOf('(', start) + 1).trim();
  const declared = declaredTypes(text, subject);
  if (subject === 'this' || qualified.size > 1) {
    return [];
  }
  return qualified.size === 1 ? [...qualified] : (declared ?? [...enums().keys()]);
}

function partialSwitch(text: string, start: number, enums: () => Enums): string | undefined {
  const labels = listedLabels(switchBody(text, start));
  const compared = new Set(labels.map((parts) => parts.at(-1)));
  const declarations = switchCandidates({ text, start, enums }, labels)
    .map((type): [string, EnumDeclaration | undefined] => [
      textOf(type),
      declarationFor(enums().get(textOf(type)), text, textOf(type)),
    ])
    .filter(([, declared]) =>
      [...compared].every((constant) => declared?.constants.includes(textOf(constant))),
    );
  if (declarations.length === 0 || compared.size < MINIMUM_LISTED) {
    return undefined;
  }
  const isPartial = declarations.every(([, declared]) => isPartialOf(declared, compared));
  if (!isPartial) {
    return undefined;
  }
  return declarations.length === 1 ? declarations[0]?.[0] : GENERIC_ENUM;
}

function partialEnum(
  finding: JavaFinding,
  { projectRoot, enums }: { projectRoot: string; enums: () => Enums },
): string | undefined {
  const text = readJavaSource(path.join(projectRoot, finding.path));
  if (text === undefined || finding.location === undefined) {
    return undefined;
  }
  const start = offsetOf(text, {
    line: finding.location.line ?? 1,
    column: finding.location.column,
  });
  if (SWITCH_START.test(text.slice(start))) {
    return partialSwitch(text, start, enums);
  }
  const expression = expressionAt(text, start);
  for (const [type, compared] of comparedConstants(expression, { text, enums })) {
    if (isPartialOf(declarationFor(enums().get(textOf(type)), text, textOf(type)), compared)) {
      return type;
    }
  }
  return undefined;
}

function isKotlinFile(file: string): boolean {
  return file.endsWith('.kt');
}

export function withProjectEnumPredicates(
  findings: readonly JavaFinding[],
  projectRoot: string,
): JavaFinding[] {
  const context = { projectRoot, enums: lazy(() => readEnums(projectRoot)) };
  return findings.flatMap((finding) => {
    if (
      finding.tool !== 'pmd' ||
      finding.rule !== ENUM_PREDICATE_RULE ||
      isKotlinFile(finding.path)
    ) {
      return [finding];
    }
    const type = partialEnum(finding, context);
    return type === undefined
      ? []
      : [{ ...finding, message: (finding.message ?? '').replace(GENERIC_ENUM, type) }];
  });
}
