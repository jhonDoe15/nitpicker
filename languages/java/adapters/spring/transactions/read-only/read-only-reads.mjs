import path from 'node:path';
import { escapeRegExp } from '../../../../../../shared/paths/glob.mjs';
import {
  REPOSITORY_WRITES,
  WRITE_VERB,
} from '../../../kotlin/review-rules/spring/transactions/writes.mjs';
import {
  blankLiterals,
  offsetOf,
  pathInside,
  readJavaSource,
  sourceFilesUnder,
} from '../../../review-rules/java-sources.mjs';

const RULE = 'SpringTransactionalReadOnlyWrite';
const WRITES = new Set(REPOSITORY_WRITES);
const NAME = String.raw`[A-Za-z_$][\w$]*`;
const SITE = new RegExp(
  String.raw`^(?:this\s*\.\s*)?(${NAME})\s*(?:\.\s*(${NAME})\s*(\(|=(?!=))|::\s*(${NAME}))`,
  'u',
);
const SETTER = /^set\p{Lu}/u;
const QUERY = /@(?:[\w.]*\.)?(?:Query|NativeQuery)\b/u;
const WRITING = /@(?:[\w.]*\.)?(?:Modifying|Procedure)\b|\bdefault\b/u;
const ENTITY = /@(?:[\w.]*\.)?Entity\b/u;
const BOUNDARY = /[;{}][^;{}]*$/u;
const EXTENSIONS = ['.java', '.kt'];

function siteAt(text, location) {
  const start = offsetOf(text, { line: location?.line ?? 1, column: location?.column ?? 1 });
  const match = SITE.exec(text.slice(start));
  if (match === null) {
    return undefined;
  }
  const [, receiver, member, operator, referenced] = match;
  const field = operator === '=';
  return { receiver, name: member ?? referenced, call: !field, field };
}

function declaredType(text, name) {
  const declaration = new RegExp(
    String.raw`\b([A-Z][\w$]*)(?:<[^;{}()]*>)?\s+${escapeRegExp(name)}\s*[;,)=]`,
    'u',
  );
  return declaration.exec(text)?.[1];
}

function bodyOf(text, kind, type) {
  const header = new RegExp(String.raw`\b${kind}\s+${escapeRegExp(type)}\b[^{;]*\{`, 'u').exec(
    text,
  );
  return header === null
    ? undefined
    : {
        prefix: BOUNDARY.exec(text.slice(0, header.index))?.[0] ?? text.slice(0, header.index),
        body: text.slice(header.index + header[0].length),
      };
}

function declarationsOf(body, name) {
  const call = new RegExp(String.raw`(?<![\w$.])${escapeRegExp(name)}\s*\(`, 'gu');
  let depth = 0;
  let scanned = 0;
  const prefixes = [];
  for (const match of body.matchAll(call)) {
    for (const character of body.slice(scanned, match.index)) {
      depth += { '{': 1, '}': -1 }[character] ?? 0;
    }
    scanned = match.index;
    if (depth < 0) {
      break;
    }
    if (depth === 0) {
      prefixes.push(BOUNDARY.exec(body.slice(0, match.index))?.[0] ?? body.slice(0, match.index));
    }
  }
  return prefixes;
}

function sourcesOf(index, type) {
  return (index.get(type) ?? []).map((file) => blankLiterals(readJavaSource(file) ?? ''));
}

function readsOnly(index, type, name) {
  const declarations = sourcesOf(index, type).flatMap((text) => {
    const found = bodyOf(text, 'interface', type);
    return found === undefined ? [] : declarationsOf(found.body, name);
  });
  return (
    declarations.length > 0 &&
    declarations.every((prefix) => QUERY.test(prefix) && !WRITING.test(prefix))
  );
}

function plainClass(index, type) {
  const headers = sourcesOf(index, type).flatMap((text) =>
    ['class', 'record'].map((kind) => bodyOf(text, kind, type)).filter(Boolean),
  );
  return headers.length > 0 && headers.every(({ prefix }) => !ENTITY.test(prefix));
}

function sourceIndex(projectRoot, roots) {
  const index = new Map();
  for (const root of new Set(roots)) {
    for (const file of sourceFilesUnder(pathInside(projectRoot, root), EXTENSIONS)) {
      const name = path.basename(file, path.extname(file));
      index.set(name, [...(index.get(name) ?? []), file]);
    }
  }
  return index;
}

function notAWrite(site, type, index) {
  if (site.field || SETTER.test(site.name)) {
    return plainClass(index, type);
  }
  return !WRITES.has(site.name) && !WRITE_VERB.test(site.name) && readsOnly(index, type, site.name);
}

export function withoutReadOnlyReads(findings, { projectRoot, roots }) {
  let index;
  return findings.filter((finding) => {
    if (finding.tool !== 'pmd' || finding.rule !== RULE) {
      return true;
    }
    const text = blankLiterals(readJavaSource(path.join(projectRoot, finding.path)) ?? '');
    const site = siteAt(text, finding.location);
    const type = site === undefined ? undefined : declaredType(text, site.receiver);
    if (type === undefined) {
      return true;
    }
    index ??= sourceIndex(projectRoot, roots);
    return !notAWrite(site, type, index);
  });
}
