import path from 'node:path';
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
const CALL = /^([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/u;
const QUERY = /@(?:[\w.]*\.)?(?:Query|NativeQuery)\b/u;
const WRITING = /@(?:[\w.]*\.)?(?:Modifying|Procedure)\b|\bdefault\b/u;
const BOUNDARY = /[;{}][^;{}]*$/u;
const EXTENSIONS = ['.java', '.kt'];

function escaped(name) {
  return name.replaceAll('$', String.raw`\$`);
}

function calledAt(text, location) {
  const start = offsetOf(text, { line: location?.line ?? 1, column: location?.column ?? 1 });
  const match = CALL.exec(text.slice(start));
  return match === null ? undefined : { receiver: match[1], name: match[2] };
}

function declaredType(text, name) {
  const declaration = new RegExp(
    String.raw`\b([A-Z][\w$]*)(?:<[^;{}()]*>)?\s+${escaped(name)}\s*[;,)=]`,
    'u',
  );
  return declaration.exec(text)?.[1];
}

function interfaceBody(text, type) {
  const header = new RegExp(String.raw`\binterface\s+${escaped(type)}\b[^{;]*\{`, 'u').exec(text);
  return header === null ? undefined : text.slice(header.index + header[0].length);
}

function declarationsOf(body, name) {
  const call = new RegExp(String.raw`(?<![\w$.])${escaped(name)}\s*\(`, 'gu');
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

function readsOnly(index, type, name) {
  const declarations = (index.get(type) ?? []).flatMap((file) => {
    const body = interfaceBody(blankLiterals(readJavaSource(file) ?? ''), type);
    return body === undefined ? [] : declarationsOf(body, name);
  });
  return (
    declarations.length > 0 &&
    declarations.every((prefix) => QUERY.test(prefix) && !WRITING.test(prefix))
  );
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

export function withoutQueryReads(findings, { projectRoot, roots }) {
  let index;
  return findings.filter((finding) => {
    if (finding.tool !== 'pmd' || finding.rule !== RULE) {
      return true;
    }
    const text = blankLiterals(readJavaSource(path.join(projectRoot, finding.path)) ?? '');
    const call = calledAt(text, finding.location);
    if (call === undefined || WRITES.has(call.name) || WRITE_VERB.test(call.name)) {
      return true;
    }
    const type = declaredType(text, call.receiver);
    if (type === undefined) {
      return true;
    }
    index ??= sourceIndex(projectRoot, roots);
    return !readsOnly(index, type, call.name);
  });
}
