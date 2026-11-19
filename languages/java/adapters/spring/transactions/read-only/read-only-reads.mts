import path from 'node:path';
import { escapeRegExp } from '../../typed/shared-views.mts';
import {
  REPOSITORY_WRITES,
  WRITE_VERB,
} from '../../../kotlin/review-rules/spring/transactions/writes.mts';
import {
  blankLiterals,
  offsetOf,
  pathInside,
  readJavaSource,
  sourceFilesUnder,
} from '../../../review-rules/java-sources.mts';
import { pmdFindingsKept } from '../../typed/pmd-filter.mts';
import type { JavaFinding } from '../../../typed/java-values.mts';
import type { ReadSite, TransactionOptions, TypeBody } from '../transaction-types.mts';

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
const BRACES: Readonly<Record<string, number>> = { '{': 1, '}': -1 };

function siteAt(text: string, location: JavaFinding['location']): ReadSite | undefined {
  const start = offsetOf(text, { line: location?.line ?? 1, column: location?.column ?? 1 });
  const match = SITE.exec(text.slice(start));
  if (match === null) {
    return undefined;
  }
  const [, receiver = '', member, operator, referenced] = match;
  const field = operator === '=';
  return { receiver, name: member ?? referenced ?? '', call: !field, field };
}

function declaredType(text: string, name: string): string | undefined {
  const declaration = new RegExp(
    String.raw`\b([A-Z][\w$]*)(?:<[^;{}()]*>)?\s+${escapeRegExp(name)}\s*[;,)=]`,
    'u',
  );
  return declaration.exec(text)?.[1];
}

function bodyOf(text: string, kind: string, type: string): TypeBody | undefined {
  const header = new RegExp(
    String.raw`\b${escapeRegExp(kind)}\s+${escapeRegExp(type)}\b[^{;]*\{`,
    'u',
  ).exec(text);
  return header === null
    ? undefined
    : {
        prefix: BOUNDARY.exec(text.slice(0, header.index))?.[0] ?? text.slice(0, header.index),
        body: text.slice(header.index + header[0].length),
      };
}

function declarationsOf(body: string, name: string): string[] {
  const call = new RegExp(String.raw`(?<![\w$.])${escapeRegExp(name)}\s*\(`, 'gu');
  let depth = 0;
  let scanned = 0;
  const prefixes: string[] = [];
  for (const match of body.matchAll(call)) {
    for (const character of body.slice(scanned, match.index)) {
      depth += BRACES[character] ?? 0;
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

function sourcesOf(index: ReadonlyMap<string, string[]>, type: string): string[] {
  return (index.get(type) ?? []).map((file) => blankLiterals(readJavaSource(file) ?? ''));
}

function readsOnly(index: ReadonlyMap<string, string[]>, type: string, name: string): boolean {
  const declarations = sourcesOf(index, type).flatMap((text) => {
    const found = bodyOf(text, 'interface', type);
    return found === undefined ? [] : declarationsOf(found.body, name);
  });
  return (
    declarations.length > 0 &&
    declarations.every((prefix) => QUERY.test(prefix) && !WRITING.test(prefix))
  );
}

function plainClass(index: ReadonlyMap<string, string[]>, type: string): boolean {
  const headers = sourcesOf(index, type).flatMap((text) =>
    ['class', 'record']
      .map((kind) => bodyOf(text, kind, type))
      .filter((found): found is TypeBody => found !== undefined),
  );
  return headers.length > 0 && headers.every(({ prefix }) => !ENTITY.test(prefix));
}

function sourceIndex(projectRoot: string, roots: readonly string[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const root of new Set(roots)) {
    for (const file of sourceFilesUnder(pathInside(projectRoot, root), EXTENSIONS)) {
      const name = path.basename(file, path.extname(file));
      index.set(name, [...(index.get(name) ?? []), file]);
    }
  }
  return index;
}

function notAWrite(site: ReadSite, type: string, index: ReadonlyMap<string, string[]>): boolean {
  if (site.field || SETTER.test(site.name)) {
    return plainClass(index, type);
  }
  return !WRITES.has(site.name) && !WRITE_VERB.test(site.name) && readsOnly(index, type, site.name);
}

export function withoutReadOnlyReads<T extends JavaFinding>(
  findings: T[],
  { projectRoot, roots }: TransactionOptions,
): T[] {
  return pmdFindingsKept(findings, {
    rules: (rule) => rule === RULE,
    build: () => sourceIndex(projectRoot, roots),
    keep: (finding, index) => {
      const text = blankLiterals(readJavaSource(path.join(projectRoot, finding.path)) ?? '');
      const site = siteAt(text, finding.location);
      const type = site === undefined ? undefined : declaredType(text, site.receiver);
      if (site === undefined || type === undefined) {
        return true;
      }
      return !notAWrite(site, type, index());
    },
  });
}
