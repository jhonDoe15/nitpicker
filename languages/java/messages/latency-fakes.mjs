import { existsSync } from 'node:fs';
import {
  importsOf,
  offsetOf,
  packageOf,
  pathInside,
  readJavaSource,
} from '../adapters/review-rules/java-sources.mjs';

const NAMED_TYPE = /\b(?:class|record|enum)\s+[A-Za-z_$][\w$]*/gu;
const ANONYMOUS_TYPE = /\bnew\s+([A-Za-z_$][\w$.]*)\s*(?:<[^;{}]*?>)?\s*\(/gu;
const GENERICS = /<(?:[^<>]|<(?:[^<>]|<[^<>]*>)*>)*>/gu;
const WAIT_CALL = /\b(?:sleep|parkNanos|join|wait)\s*\(/u;
const SUPERTYPES = /\b(?:extends|implements)\b([\s\S]*)$/u;
const SUPERTYPE_SEPARATOR = /\s*(?:,|\bimplements\b)\s*/u;
const TEST_ANNOTATION = /@(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b/u;
const SOURCE_EXTENSIONS = ['.java', '.kt'];
const BRACKETS = { '{': 1, '(': 1, '}': -1, ')': -1 };

function closingOf(text, open) {
  let depth = 0;
  for (const [index, character] of [...text.slice(open)].entries()) {
    depth += BRACKETS[character] ?? 0;
    if (depth === 0) {
      return open + index;
    }
  }
  return text.length;
}

function namedTypes(text) {
  return [...text.matchAll(NAMED_TYPE)].flatMap((match) => {
    const open = text.indexOf('{', match.index);
    const header = text.slice(match.index + match[0].length, open).replaceAll(GENERICS, '');
    const supertypes = SUPERTYPES.exec(header.replaceAll(/\([^()]*\)/gu, ' '))?.[1] ?? '';
    return open < 0 ? [] : [{ open, supertypes: supertypes.split(SUPERTYPE_SEPARATOR) }];
  });
}

function anonymousTypes(text) {
  return [...text.matchAll(ANONYMOUS_TYPE)].flatMap((match) => {
    const arguments_ = match.index + match[0].length - 1;
    const after = closingOf(text, arguments_) + 1;
    const open = after + (/^\s*/u.exec(text.slice(after))?.[0].length ?? 0);
    return text[open] === '{' ? [{ open, supertypes: [match[1]] }] : [];
  });
}

function enclosingType(text, offset) {
  return [...namedTypes(text), ...anonymousTypes(text)]
    .map((type) => ({ ...type, close: closingOf(text, type.open) }))
    .filter(({ open, close }) => open < offset && offset < close)
    .toSorted((left, right) => right.open - left.open)[0];
}

function candidatesOf(name, text) {
  const [first, ...rest] = name.split('.');
  const imported = importsOf(text).find((entry) => entry.split('.').at(-1) === first);
  if (imported !== undefined) {
    return [[imported, ...rest].join('.')];
  }
  const local = [packageOf(text), name].filter(Boolean).join('.');
  return /^[a-z]/u.test(first) ? [name, local] : [local];
}

function declaredIn(roots, projectRoot) {
  return (qualified) => {
    const parts = qualified.split('.');
    return parts.some((_, index) => {
      const file = parts.slice(0, parts.length - index).join('/');
      return (
        file !== '' &&
        roots.some((root) =>
          SOURCE_EXTENSIONS.some((extension) =>
            existsSync(pathInside(projectRoot, `${root}/${file}${extension}`)),
          ),
        )
      );
    });
  };
}

function isInFake(finding, { projectRoot, mainRoots }) {
  const text = readJavaSource(pathInside(projectRoot, finding.path));
  const line = finding.location?.line;
  if (text === undefined || line === undefined) {
    return false;
  }
  const start = offsetOf(text, { line });
  const call = WAIT_CALL.exec(text.slice(start).split('\n')[0])?.index ?? 0;
  const type = enclosingType(text, start + call);
  if (type === undefined || TEST_ANNOTATION.test(text.slice(type.open, type.close))) {
    return false;
  }
  const isProduction = declaredIn(mainRoots, projectRoot);
  return type.supertypes
    .map((name) => name.trim())
    .filter(Boolean)
    .some((name) => candidatesOf(name, text).some(isProduction));
}

export function dropSleepsInFakes(findings, { rule, projectRoot, mainRoots }) {
  if (projectRoot === undefined || !findings.some((finding) => finding.rule === rule)) {
    return findings;
  }
  return findings.filter(
    (finding) =>
      finding.tool !== 'pmd' ||
      finding.rule !== rule ||
      !isInFake(finding, { projectRoot, mainRoots }),
  );
}
