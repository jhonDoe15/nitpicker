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

export const ENUM_PREDICATE_RULE = 'ExhaustiveEnumPredicate';
const GENERIC_ENUM = 'an enum of the project';
const MINIMUM_CONSTANTS = 3;
const ENUM_HEADER = /\benum\s+(\w+)/gu;
const ANNOTATION = /@[\w.]+(?:\s*\([^()]*\))?/gu;
const IDENTIFIER = /^[A-Za-z_$][\w$]*/u;
const DOTTED_NAME = /[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)+/gu;
const TYPE_NAME = /^[A-Z]/u;
const BARE_CONSTANT = /(?<![\w$.])([A-Z][A-Z0-9_]*)(?![\w$]|\s*[.(])/gu;

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

function readEnums(projectRoot) {
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

function comparedConstants(expression, { text, enums }) {
  const byType = new Map();
  const add = (type, constant) =>
    byType.set(type, new Set([...(byType.get(type) ?? []), constant]));
  for (const [name] of expression.matchAll(DOTTED_NAME)) {
    const parts = name.split('.').map((part) => part.trim());
    const [type, constant] = parts.slice(parts.length - 2);
    if (TYPE_NAME.test(type)) {
      add(type, constant);
    }
  }
  const imports = staticImportsOf(text);
  for (const [, name] of expression.matchAll(BARE_CONSTANT)) {
    const type = imports.length === 0 ? undefined : staticOwner(imports, name, enums);
    if (type !== undefined) {
      add(type, name);
    }
  }
  return byType;
}

function partialEnum(finding, { projectRoot, enums }) {
  const text = readJavaSource(path.join(projectRoot, finding.path));
  if (text === undefined || finding.location === undefined) {
    return undefined;
  }
  const expression = expressionAt(text, offsetOf(text, finding.location));
  for (const [type, compared] of comparedConstants(expression, { text, enums })) {
    const declared = declarationFor(enums().get(type), text, type);
    const constants = declared?.constants ?? [];
    const isPartial =
      constants.length >= MINIMUM_CONSTANTS &&
      compared.size < constants.length &&
      [...compared].every((constant) => constants.includes(constant));
    if (isPartial) {
      return type;
    }
  }
  return undefined;
}

function lazy(read) {
  let value;
  return () => {
    value ??= read();
    return value;
  };
}

export function withProjectEnumPredicates(findings, projectRoot) {
  const context = { projectRoot, enums: lazy(() => readEnums(projectRoot)) };
  return findings.flatMap((finding) => {
    if (finding.tool !== 'pmd' || finding.rule !== ENUM_PREDICATE_RULE) {
      return [finding];
    }
    const type = partialEnum(finding, context);
    return type === undefined
      ? []
      : [{ ...finding, message: finding.message.replace(GENERIC_ENUM, type) }];
  });
}
