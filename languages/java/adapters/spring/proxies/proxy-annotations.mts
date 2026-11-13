import { readFileSync } from 'node:fs';
import { blankComments, javaFilesUnder, packageOf } from '../../review-rules/java-sources.mjs';
import {
  ADVICE as ADVICE_GROUP,
  ASPECT as ASPECT_GROUP,
  CONSTRAINT as CONSTRAINT_GROUP,
  CONSTRAINTS as CONSTRAINTS_GROUP,
  META_PROXIED as META_PROXIED_GROUP,
  PROXIED as PROXIED_GROUP,
} from '../../kotlin/review-rules/spring/spring-types.mjs';
import {
  type Resolve,
  type TypeDeclaration,
  closingOf,
  javaResolver,
  topLevel,
  typeDeclarations,
} from './java-declarations.mts';
import { textOf, textsOf } from '../../../../../shared/values/readers.mts';

export type ProxyAnnotations = {
  readonly proxied: readonly string[];
  readonly constraints: readonly string[];
};
type Source = {
  readonly strings: string;
  readonly text: string;
  readonly types: readonly TypeDeclaration[];
  readonly constants: ReadonlyMap<string, string>;
  readonly resolve: Resolve;
};
type Declared = { readonly qualified: string; readonly metas: readonly string[][] };

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

function namesOf(group: unknown): ReadonlySet<string> {
  return new Set(group instanceof Set ? textsOf([...group]) : []);
}

const ADVICE = namesOf(ADVICE_GROUP);
const ASPECT = namesOf(ASPECT_GROUP);
const CONSTRAINT = namesOf(CONSTRAINT_GROUP);
const CONSTRAINTS = namesOf(CONSTRAINTS_GROUP);
const META_PROXIED = namesOf(META_PROXIED_GROUP);
const PROXIED = namesOf(PROXIED_GROUP);

function hits(candidates: readonly string[], fqns: ReadonlySet<string>): boolean {
  return candidates.some((candidate) => fqns.has(candidate));
}

function blankStrings(strings: string): string {
  return strings.replaceAll(LITERAL, (literal) =>
    literal.replaceAll(/[^\n]/gu, (character) => ' '.repeat(character.length)),
  );
}

function contentsOf(text: string): string {
  return [...text.matchAll(STRING)].map((match) => match[1] ?? match[2] ?? '').join('');
}

function sourceOf(file: string): Source | undefined {
  const raw = readFileSync(file, 'utf8');
  if (!raw.includes('@interface') && !raw.includes('Aspect')) {
    return undefined;
  }
  const strings = textOf(blankComments(raw));
  const text = blankStrings(strings);
  const packageName = textOf(packageOf(text));
  const types = typeDeclarations(text, packageName);
  const constants = new Map(
    [...strings.matchAll(CONSTANT)].map((match) => [match[1] ?? '', contentsOf(match[2] ?? '')]),
  );
  return { strings, text, types, constants, resolve: javaResolver(text, packageName, types) };
}

function skipAnnotations(text: string, from: number): number {
  const pending = [from];
  for (const index of pending) {
    const match = LEADING_ANNOTATION.exec(text.slice(index));
    if (match !== null) {
      const end = index + match[0].length;
      pending.push(text[end] === '(' ? closingOf(text, end) + 1 : end);
    }
  }
  return pending.at(-1) ?? from;
}

function parameterParts(text: string, open: number): string[] {
  let depth = 0;
  let current = '';
  const parts: string[] = [];
  for (const character of text.slice(open + 1, closingOf(text, open))) {
    depth += character === '<' ? 1 : 0;
    depth -= character === '>' ? 1 : 0;
    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  return [...parts, current];
}

function parametersAfter(text: string, from: number): Map<string, string> {
  const open = text.indexOf('(', skipAnnotations(text, from));
  if (open < 0) {
    return new Map();
  }
  return new Map(
    parameterParts(text, open)
      .map((part) =>
        topLevel(part)
          .replaceAll(/@\s*[\w.]+/gu, ' ')
          .replaceAll(/<[^]*>/gu, ' '),
      )
      .map((part) => part.trim().split(/\s+/u))
      .filter((tokens) => tokens.length >= 2)
      .map((tokens) => {
        const [type = '', name = ''] = tokens.slice(tokens.length - 2);
        return [name, type.replaceAll('[]', '').replaceAll('...', '')];
      }),
  );
}

function pointcutTargets({ strings, text, constants, resolve }: Source): string[][] {
  return [...text.matchAll(ADVICE_ANNOTATION)]
    .filter((match) => hits(resolve(match[1] ?? ''), ADVICE))
    .flatMap((match) => {
      const open = match.index + match[0].length - 1;
      const close = closingOf(text, open);
      const named = [...text.slice(open, close).matchAll(IDENTIFIER)]
        .map(([name]) => constants.get(name))
        .filter((value) => value !== undefined);
      const pointcut = [contentsOf(strings.slice(open, close)), ...named].join(' ');
      const parameters = parametersAfter(text, close + 1);
      return [...pointcut.matchAll(ANNOTATION_POINTCUT)].map(({ 1: target = '' }) => {
        const bound = BINDING.test(target) ? parameters.get(target) : undefined;
        return resolve(bound ?? target);
      });
    });
}

function isAspect(source: Source): boolean {
  return source.types.some((type) =>
    type.annotations.some((name) => hits(source.resolve(name), ASPECT)),
  );
}

function grow(known: ReadonlySet<string>, declared: readonly Declared[]): ReadonlySet<string> {
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
  return rounds.at(-1) ?? known;
}

function declaredAnnotations(sources: readonly Source[]): Declared[] {
  return sources.flatMap((source) =>
    source.types
      .filter((type) => type.annotation)
      .map((type) => ({
        qualified: type.qualified,
        metas: type.annotations.map((name) => source.resolve(name)),
      })),
  );
}

export function projectProxyAnnotations(projectRoot: string): ProxyAnnotations {
  const sources = textsOf(javaFilesUnder(projectRoot))
    .map((file) => sourceOf(file))
    .filter((source) => source !== undefined);
  const declared = declaredAnnotations(sources);
  const proxied = grow(META_PROXIED, declared);
  const constraints = grow(new Set([...CONSTRAINTS, ...CONSTRAINT]), declared);
  const names = new Set(declared.map(({ qualified }) => qualified));
  const advised = sources
    .filter((source) => isAspect(source))
    .flatMap((source) => pointcutTargets(source))
    .map(
      (candidates) =>
        candidates.find((name) => names.has(name) || PROXIED.has(name)) ?? candidates[0] ?? '',
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
