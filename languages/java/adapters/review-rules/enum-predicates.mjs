import path from 'node:path';
import {
  expressionAt,
  importsOf,
  javaFilesUnder,
  offsetOf,
  packageOf,
  readJavaSource,
  staticImportsOf,
} from './java-sources.mjs';
import { lazy } from '../../../../shared/rules/finding-helpers.mjs';

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
const SWITCH_LABEL = /\b(?:case\b([^:-]*)|default\s*)(?:->|:)/gu;
const DEFAULT_LABEL = /\bdefault\b/u;
const IDENTIFIER_ONLY = /^[A-Za-z_$][\w$]*$/u;
const DECLARED_TYPE = String.raw`(?<![\w$.])([A-Z][\w$]*)(?:<[^<>;]*>)?\s+`;
const BRACE_DEPTH = { '{': 1, '}': -1 };

function splitTopLevel(text) {
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
      parts[parts.length - 1] += character;
    }
  }
  return parts;
}

function constantsOf(body) {
  return splitTopLevel(body)
    .map((part) => IDENTIFIER.exec(part.replaceAll(ANNOTATION, ' ').trim())?.[0])
    .filter((name) => name !== undefined);
}

function enumBody(text, from) {
  const open = text.indexOf('{', from);
  return open < 0 || text.slice(from, open).includes(';') ? undefined : text.slice(open + 1);
}

export function readEnums(projectRoot) {
  const enums = new Map();
  for (const file of javaFilesUnder(projectRoot)) {
    const text = readJavaSource(file);
    for (const match of text.matchAll(ENUM_HEADER)) {
      const body = enumBody(text, match.index + match[0].length);
      const declared = { packageName: packageOf(text), constants: constantsOf(body ?? '') };
      enums.set(match[1], [
        ...(enums.get(match[1]) ?? []),
        ...(body === undefined ? [] : [declared]),
      ]);
    }
  }
  return enums;
}

function constantsKey(declared) {
  return [...declared.constants].sort().join(',');
}

function sameConstants(declarations) {
  const [first] = declarations;
  return declarations.every((declared) => constantsKey(declared) === constantsKey(first))
    ? first
    : undefined;
}

function declarationFor(declarations, text, name) {
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

function simpleName(qualified) {
  return qualified.split('.').at(-1);
}

function staticOwner(imports, name, enums) {
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

function qualifiedConstants(expression) {
  return [...expression.matchAll(DOTTED_NAME)]
    .map(({ 0: name, index }) => {
      const parts = name.split('.').map((part) => part.trim());
      const called = CALLED.test(expression.slice(index + name.length));
      return (called ? parts.slice(0, -1) : parts).slice(-TYPE_AND_CONSTANT);
    })
    .filter((parts) => parts.length === TYPE_AND_CONSTANT && TYPE_NAME.test(parts[0]));
}

function importedConstants(expression, { text, enums }) {
  const imports = staticImportsOf(text);
  if (imports.length === 0) {
    return [];
  }
  return [...expression.matchAll(BARE_CONSTANT)]
    .map(([, name]) => [staticOwner(imports, name, enums), name])
    .filter(([type]) => type !== undefined);
}

function comparedConstants(expression, source) {
  const byType = new Map();
  for (const [type, constant] of [
    ...qualifiedConstants(expression),
    ...importedConstants(expression, source),
  ]) {
    byType.set(type, new Set([...(byType.get(type) ?? []), constant]));
  }
  return byType;
}

function isPartialOf(declared, compared) {
  const constants = declared?.constants ?? [];
  return (
    compared.size >= MINIMUM_LISTED &&
    constants.length >= MINIMUM_CONSTANTS &&
    compared.size < constants.length &&
    [...compared].every((constant) => constants.includes(constant))
  );
}

function switchBody(text, start) {
  const open = text.indexOf('{', start);
  const body = open < 0 ? '' : text.slice(open + 1);
  let depth = 1;
  let end = 0;
  for (const character of body) {
    depth += BRACE_DEPTH[character] ?? 0;
    if (depth === 0) {
      return body.slice(0, end);
    }
    end += character.length;
  }
  return '';
}

function switchEntries(body) {
  return [...body.matchAll(SWITCH_LABEL)].map((match) => ({
    labels: match[1],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function listedLabels(body) {
  const entries = switchEntries(body);
  const listed = [];
  let intoDefault = false;
  for (const [index, entry] of [...entries.entries()].reverse()) {
    const next = entries[index + 1];
    const fallsThrough = next !== undefined && body.slice(entry.end, next.start).trim() === '';
    const isDefault = entry.labels === undefined || DEFAULT_LABEL.test(entry.labels);
    intoDefault = isDefault || (fallsThrough && intoDefault);
    listed.push(...(intoDefault ? [] : entry.labels.split(',')));
  }
  return listed
    .map((label) => label.split('.').map((part) => part.trim()))
    .filter((parts) => parts.join('.') !== 'null');
}

function declaredTypes(text, subject) {
  if (!IDENTIFIER_ONLY.test(subject)) {
    return undefined;
  }
  const declaration = new RegExp(String.raw`${DECLARED_TYPE}${subject}(?![\w$])\s*[,)=;:]`, 'gu');
  const types = new Set([...text.matchAll(declaration)].map(([, type]) => type));
  return types.size === 1 ? [...types] : undefined;
}

function switchCandidates({ text, start, enums }, labels) {
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

function partialSwitch(text, start, enums) {
  const labels = listedLabels(switchBody(text, start));
  const compared = new Set(labels.map((parts) => parts.at(-1)));
  const declarations = switchCandidates({ text, start, enums }, labels)
    .map((type) => [type, declarationFor(enums().get(type), text, type)])
    .filter(([, declared]) =>
      [...compared].every((constant) => declared?.constants.includes(constant)),
    );
  if (declarations.length === 0 || compared.size < MINIMUM_LISTED) {
    return undefined;
  }
  const isPartial = declarations.every(([, declared]) => isPartialOf(declared, compared));
  if (!isPartial) {
    return undefined;
  }
  return declarations.length === 1 ? declarations[0][0] : GENERIC_ENUM;
}

function partialEnum(finding, { projectRoot, enums }) {
  const text = readJavaSource(path.join(projectRoot, finding.path));
  if (text === undefined || finding.location === undefined) {
    return undefined;
  }
  const start = offsetOf(text, finding.location);
  if (SWITCH_START.test(text.slice(start))) {
    return partialSwitch(text, start, enums);
  }
  const expression = expressionAt(text, start);
  for (const [type, compared] of comparedConstants(expression, { text, enums })) {
    if (isPartialOf(declarationFor(enums().get(type), text, type), compared)) {
      return type;
    }
  }
  return undefined;
}

function isKotlinFile(file) {
  return file.endsWith('.kt');
}

export function withProjectEnumPredicates(findings, projectRoot) {
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
      : [{ ...finding, message: finding.message.replace(GENERIC_ENUM, type) }];
  });
}
