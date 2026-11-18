import { escapeRegExp } from '../../../typed/regex-escape.mts';
export type Scopes = { initializers(name: string): string[] | undefined };
type Blocks = {
  readonly depths: Int32Array;
  readonly closed: [number, number][];
  readonly enclosing: number[];
};
type Method = {
  readonly start: number;
  readonly end: number;
  readonly parameters: ReadonlySet<string>;
};

const BLANKED = /"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//gu;
const CONTROL = /^(?:if|for|while|switch|catch|synchronized|try|else|do)\b/u;
const ASSIGN = '\\s*(?:[-+*/|&^%]|<<|>>>?)?=(?!=)([^;]*);';

export function blanked(source: string): string {
  return source.replaceAll(BLANKED, (text) => text.replaceAll(/[^\r\n]/gu, ' '));
}

function blocks(clean: string, offset: number): Blocks {
  const open: number[] = [];
  const closed: [number, number][] = [];
  const depths = new Int32Array(clean.length + 1);
  let enclosing: number[] = [];
  for (const [index, character] of Array.from(clean).entries()) {
    depths[index] = open.length;
    if (index === offset) {
      enclosing = [...open];
    }
    if (character === '{') {
      open.push(index);
    } else if (character === '}') {
      closed.push([open.pop() ?? -1, index]);
    }
  }
  return { depths, closed, enclosing };
}

function headerOf(clean: string, start: number): string {
  const boundary = Math.max(
    clean.lastIndexOf(';', start - 1),
    clean.lastIndexOf('{', start - 1),
    clean.lastIndexOf('}', start - 1),
  );
  return clean.slice(boundary + 1, start).trim();
}

function isMethodHeader(header: string): boolean {
  return (
    !CONTROL.test(header) &&
    header
      .replace(/\bthrows\b[^()]*$/u, '')
      .trimEnd()
      .endsWith(')')
  );
}

function parametersOf(header: string): Set<string> {
  const list = header.slice(header.indexOf('(') + 1, header.lastIndexOf(')'));
  return new Set(
    [...list.matchAll(/([A-Za-z_$][\w$]*)\s*(?=,|$)/gu)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    ),
  );
}

function enclosingMethod({
  clean,
  closed,
  enclosing,
}: Blocks & { clean: string }): Method | undefined {
  for (const start of enclosing.toReversed()) {
    const header = headerOf(clean, start);
    if (isMethodHeader(header)) {
      const end = closed.find(([from]) => from === start)?.[1] ?? clean.length;
      return { start, end, parameters: parametersOf(header) };
    }
  }
  return undefined;
}

export function analyseSource(source: string, offset: number): Scopes {
  const clean = blanked(source);
  const structure = blocks(clean, offset);
  const method = enclosingMethod({ clean, ...structure });
  const memberDepth =
    method === undefined ? structure.depths[offset] : structure.depths[method.start];
  return {
    initializers(name) {
      if (method?.parameters.has(name)) {
        return undefined;
      }
      const pattern = new RegExp(`(?<![\\w$.])${escapeRegExp(name)}${ASSIGN}`, 'gud');
      return [...clean.matchAll(pattern)]
        .filter(({ index }) => {
          const inMethod = method !== undefined && index > method.start && index < method.end;
          return inMethod || structure.depths[index] === memberDepth;
        })
        .flatMap((match) => {
          const range = match.indices?.[1];
          return range === undefined ? [] : [source.slice(range[0], range[1])];
        });
    },
  };
}
