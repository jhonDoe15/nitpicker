import { readFileSync } from 'node:fs';
import { blankComments, javaFilesUnder, packageOf } from '../../review-rules/java-sources.mjs';
import {
  ADVICE,
  ASPECT,
  CONSTRAINT,
  CONSTRAINTS,
  META_PROXIED,
  PROXIED,
} from '../../kotlin/review-rules/spring/spring-types.mjs';
import { closingOf, javaResolver, topLevel, typeDeclarations } from './java-declarations.mjs';

const ADVICE_ANNOTATION =
  /@\s*([\w.]*(?:Around|Before|After|AfterReturning|AfterThrowing|Pointcut))\s*\(/gu;
const STRING = /"""([\s\S]*?)"""|"((?:\\.|[^"\\\n])*)"/gu;
const LITERAL = /"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/gu;
const CONSTANT = /\bString\s+([A-Za-z_$][\w$]*)\s*=([^;]+);/gu;
const IDENTIFIER = /[A-Za-z_$][\w$]*/gu;
const ANNOTATION_POINTCUT = /@annotation\(\s*([\w.$]+)\s*\)/gu;
const LEADING_ANNOTATION = /^\s*@\s*[\w.]+\s*/u;
const BINDING = /^[a-z_$][\w$]*$/u;
const META_ROUNDS = 8;

function hits(candidates, fqns) {
  return candidates.some((candidate) => fqns.has(candidate));
}

function blankStrings(strings) {
  return strings.replaceAll(LITERAL, (literal) =>
    literal
      .split('')
      .map((character) => (character === '\n' ? character : ' '))
      .join(''),
  );
}

function contentsOf(text) {
  return [...text.matchAll(STRING)].map((match) => match[1] ?? match[2]).join('');
}

function sourceOf(file) {
  const raw = readFileSync(file, 'utf8');
  if (!raw.includes('@interface') && !raw.includes('Aspect')) {
    return undefined;
  }
  const strings = blankComments(raw);
  const text = blankStrings(strings);
  const packageName = packageOf(text);
  const types = typeDeclarations(text, packageName);
  const constants = new Map(
    [...strings.matchAll(CONSTANT)].map((match) => [match[1], contentsOf(match[2])]),
  );
  return { strings, text, types, constants, resolve: javaResolver(text, packageName, types) };
}

function skipAnnotations(text, from) {
  const pending = [from];
  for (const index of pending) {
    const match = LEADING_ANNOTATION.exec(text.slice(index));
    if (match !== null) {
      const end = index + match[0].length;
      pending.push(text[end] === '(' ? closingOf(text, end) + 1 : end);
    }
  }
  return pending.at(-1);
}

function parametersAfter(text, from) {
  const open = text.indexOf('(', skipAnnotations(text, from));
  if (open < 0) {
    return new Map();
  }
  let depth = 0;
  const parts = [''];
  for (const character of text.slice(open + 1, closingOf(text, open))) {
    depth += character === '<' ? 1 : 0;
    depth -= character === '>' ? 1 : 0;
    if (character === ',' && depth === 0) {
      parts.push('');
    } else {
      parts[parts.length - 1] += character;
    }
  }
  return new Map(
    parts
      .map((part) =>
        topLevel(part)
          .replaceAll(/@\s*[\w.]+/gu, ' ')
          .replaceAll(/<[^]*>/gu, ' '),
      )
      .map((part) => part.trim().split(/\s+/u))
      .filter((tokens) => tokens.length >= 2)
      .map((tokens) => {
        const name = tokens.pop();
        return [name, tokens.pop().replaceAll('[]', '').replaceAll('...', '')];
      }),
  );
}

function pointcutTargets({ strings, text, constants, resolve }) {
  return [...text.matchAll(ADVICE_ANNOTATION)]
    .filter((match) => hits(resolve(match[1]), ADVICE))
    .flatMap((match) => {
      const open = match.index + match[0].length - 1;
      const close = closingOf(text, open);
      const named = [...text.slice(open, close).matchAll(IDENTIFIER)]
        .map(([name]) => constants.get(name))
        .filter((value) => value !== undefined);
      const pointcut = [contentsOf(strings.slice(open, close)), ...named].join(' ');
      const parameters = parametersAfter(text, close + 1);
      return [...pointcut.matchAll(ANNOTATION_POINTCUT)].map(({ 1: target }) =>
        BINDING.test(target) && parameters.has(target)
          ? resolve(parameters.get(target))
          : resolve(target),
      );
    });
}

function isAspect(source) {
  return source.types.some((type) =>
    type.annotations.some((name) => hits(source.resolve(name), ASPECT)),
  );
}

function grow(known, declared) {
  const rounds = [known];
  for (const current of rounds) {
    const added = declared
      .filter(
        ({ qualified, metas }) =>
          !current.has(qualified) && metas.some((meta) => hits(meta, current)),
      )
      .map(({ qualified }) => qualified);
    if (added.length > 0 && rounds.length <= META_ROUNDS) {
      rounds.push(new Set([...current, ...added]));
    }
  }
  return rounds.at(-1);
}

/**
 * The annotation types of the project that Spring's proxies handle: those meta-annotated with a
 * proxied annotation, those an `@Aspect` advice or pointcut names in `@annotation(...)`, and the
 * Bean Validation constraints the project declares.
 */
export function projectProxyAnnotations(projectRoot) {
  const sources = javaFilesUnder(projectRoot)
    .map((file) => sourceOf(file))
    .filter(Boolean);
  const declared = sources.flatMap((source) =>
    source.types
      .filter((type) => type.annotation)
      .map((type) => ({
        qualified: type.qualified,
        metas: type.annotations.map((name) => source.resolve(name)),
      })),
  );
  const proxied = grow(new Set(META_PROXIED), declared);
  const constraints = grow(new Set([...CONSTRAINTS, ...CONSTRAINT]), declared);
  const names = new Set(declared.map(({ qualified }) => qualified));
  const advised = sources
    .filter((source) => isAspect(source))
    .flatMap((source) => pointcutTargets(source))
    .map(
      (candidates) =>
        candidates.find((name) => names.has(name) || PROXIED.has(name)) ?? candidates[0],
    );
  const meta = [...names].filter((name) => proxied.has(name));
  return {
    proxied: [...new Set([...meta, ...advised])].filter((name) => !PROXIED.has(name)).sort(),
    constraints: declared
      .map(({ qualified }) => qualified)
      .filter((name) => constraints.has(name))
      .sort(),
  };
}
