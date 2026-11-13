export type TypeDeclaration = {
  readonly name: string;
  readonly annotation: boolean;
  readonly index: number;
  readonly open: number;
  readonly close: number;
  readonly annotations: string[];
  readonly qualified: string;
};
export type Resolve = (name: string) => string[];

const IMPORT = /^\s*import\s+([\w.]+?)(\.\*)?\s*;/gmu;
const TYPE_DECLARATION = /(@\s*)?\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/gu;
const ANNOTATION = /@\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)/gu;
const QUALIFIED = /^[a-z_$][\w$]*(?:\.[\w$]+)+$/u;
const HEADER_END = new Set([';', '{', '}']);
const OPEN = new Set(['(', '[']);
const CLOSE = new Set([')', ']']);
const BRACKETS = /[()[\]]/gu;
const BODY_START = /[()[\]{;]/gu;
const BRACES = /[{}]/gu;
const HEADER_MARKS = /[()[\]{};]/gu;
const HEADER_WINDOW = 4000;

function depthStep(character: string): number {
  return (OPEN.has(character) ? 1 : 0) - (CLOSE.has(character) ? 1 : 0);
}

export function closingOf(text: string, open: number): number {
  let depth = 0;
  for (const match of text.slice(open).matchAll(BRACKETS)) {
    depth += depthStep(match[0]);
    if (depth === 0) {
      return open + match.index;
    }
  }
  return text.length;
}

export function topLevel(text: string): string {
  let depth = 0;
  return Array.from(text, (character) => {
    depth -= CLOSE.has(character) ? 1 : 0;
    const kept = depth === 0 ? character : ' '.repeat(character.length);
    depth += OPEN.has(character) ? 1 : 0;
    return kept;
  }).join('');
}

function headerBefore(text: string, index: number): string {
  const from = Math.max(0, index - HEADER_WINDOW);
  const marks = [...text.slice(from, index).matchAll(HEADER_MARKS)].reverse();
  let depth = 0;
  for (const match of marks) {
    depth -= depthStep(match[0]);
    if (depth === 0 && HEADER_END.has(match[0])) {
      return text.slice(from + match.index + 1, index);
    }
  }
  return text.slice(from, index);
}

function annotationsIn(header: string): string[] {
  return [...topLevel(header).matchAll(ANNOTATION)]
    .map((match) => (match[1] ?? '').replaceAll(/\s/gu, ''))
    .filter((name) => name !== 'interface');
}

function bodyOpening(text: string, from: number): number {
  let depth = 0;
  for (const match of text.slice(from).matchAll(BODY_START)) {
    depth += depthStep(match[0]);
    if (depth === 0 && (match[0] === '{' || match[0] === ';')) {
      return match[0] === '{' ? from + match.index : -1;
    }
  }
  return -1;
}

function bodyClosing(text: string, open: number): number {
  let depth = 0;
  for (const match of text.slice(open).matchAll(BRACES)) {
    depth += match[0] === '{' ? 1 : -1;
    if (depth === 0) {
      return open + match.index;
    }
  }
  return text.length;
}

export function typeDeclarations(text: string, packageName: string): TypeDeclaration[] {
  const declared = [...text.matchAll(TYPE_DECLARATION)].map((match) => {
    const open = bodyOpening(text, match.index + match[0].length);
    return {
      name: match[2] ?? '',
      annotation: match[1] !== undefined,
      index: match.index,
      open,
      close: open < 0 ? -1 : bodyClosing(text, open),
      annotations: annotationsIn(headerBefore(text, match.index)),
    };
  });
  return declared.map((type) => {
    const outer = declared
      .filter((other) => other.open >= 0 && other.open < type.index && type.index < other.close)
      .map((other) => other.name);
    const binary = [...outer, type.name].join('$');
    return { ...type, qualified: packageName === '' ? binary : `${packageName}.${binary}` };
  });
}

function binaryName(parts: readonly string[]): string {
  const outer = parts.findIndex((part) => /^\p{Lu}/u.test(part));
  return outer < 0
    ? parts.join('.')
    : [parts.slice(0, outer + 1).join('.'), ...parts.slice(outer + 1)].join('$');
}

export function javaResolver(
  text: string,
  packageName: string,
  declaredTypes: readonly TypeDeclaration[],
): Resolve {
  const explicit = new Map<string, string>();
  const stars: string[] = [];
  for (const [, imported = '', star] of text.matchAll(IMPORT)) {
    if (star === undefined) {
      explicit.set(imported.split('.').at(-1) ?? imported, imported);
    } else {
      stars.push(imported);
    }
  }
  const local = new Map(declaredTypes.map((type) => [type.name, type.qualified]));
  return (name) => {
    const [first = '', ...rest] = name.split('.');
    const imported = explicit.get(first);
    if (imported !== undefined) {
      return [binaryName([...imported.split('.'), ...rest])];
    }
    const declared = local.get(first);
    if (declared !== undefined) {
      return [[declared, ...rest].join('$')];
    }
    if (QUALIFIED.test(name)) {
      return [name];
    }
    const packaged = packageName === '' ? name : `${packageName}.${name}`;
    return [packaged, ...stars.map((prefix) => `${prefix}.${name}`)];
  };
}
