import { textOf } from '../../../../shared/values/readers.mts';

type TypeBody = { readonly name: string; readonly open: number; readonly span: Span };

const ANNOTATION_START = /@(?!interface\b)[\w.]+\s*/g;
const TYPE_DECLARATION = /\b(?:class|interface|enum|record)\s+([\w$]+)/g;
const PARAMETER = /([\w.$]+)((?:\s*\[\s*\])*)\s+[\w$]+((?:\s*\[\s*\])*)$/;

export type Span = readonly [number, number];

function spaces(text: string): string {
  return text.replaceAll(/[^\n]/g, ' ');
}

export function closing(
  text: string,
  open: number,
  [opening, closingCharacter]: string = '()',
): number {
  let depth = 0;
  for (const [offset, character] of Array.from(text.slice(open)).entries()) {
    depth += { [textOf(opening)]: 1, [textOf(closingCharacter)]: -1 }[character] ?? 0;
    if (depth === 0) {
      return open + offset;
    }
  }
  return -1;
}

export function withoutAnnotations(text: string): string {
  let result = '';
  let done = 0;
  for (const match of text.matchAll(ANNOTATION_START)) {
    const after = match.index + match[0].length;
    const end = text[after] === '(' ? closing(text, after) + 1 : after;
    if (match.index >= done && end > 0) {
      result += text.slice(done, match.index) + spaces(text.slice(match.index, end));
      done = end;
    }
  }
  return result + text.slice(done);
}

function topLevelParts(parameters: string): string[] {
  let depth = 0;
  let flat = '';
  for (const character of parameters) {
    depth += { '<': 1, '>': -1, '(': 1, ')': -1 }[character] ?? 0;
    flat += depth === 0 && !'>)'.includes(character) ? character : '';
  }
  return flat
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

export function parameterTypes(parameters: string): string[] {
  return topLevelParts(parameters).map((parameter) => {
    const bare = parameter.replaceAll(/\bfinal\b/g, ' ').replace('...', '[] ');
    const match = PARAMETER.exec(bare.trim());
    return match === null
      ? bare.trim()
      : `${textOf(textOf(match[1]).split('.').at(-1))}${`${match[2]}${match[3]}`.replaceAll(/\s/g, '')}`;
  });
}

export function descriptorTypes(member: string): string[] {
  const inside = member.slice(member.indexOf('(') + 1, member.lastIndexOf(')'));
  return inside === ''
    ? []
    : inside.split(',').map((type) => textOf(type.trim().split(/[.$]/).at(-1)));
}

function typeBodies(text: string, [from, to]: Span): TypeBody[] {
  return [...text.slice(0, to).matchAll(TYPE_DECLARATION)]
    .filter((match) => match.index >= from)
    .map((match) => {
      const open = text.indexOf('{', match.index);
      const close = open === -1 ? -1 : closing(text, open, '{}');
      const span: Span = [match.index, close === -1 ? to : close];
      return { name: textOf(match[1]), open, span };
    })
    .filter(({ open }) => open !== -1 && open < to);
}

export function declaringBody(className: string, text: string): Span {
  const parts = textOf(className.split('.').at(-1)).split('$');
  let range: Span = [0, text.length];
  for (const part of parts.map((name) => name.replace(/^\d+/, ''))) {
    const found = typeBodies(text, range).find(({ name }) => name === part);
    if (part === '' || found === undefined) {
      return range;
    }
    range = found.span;
  }
  return range;
}

export function ownMember(text: string, range: Span): (index: number) => boolean {
  const nested = typeBodies(text, range)
    .map(({ span }) => span)
    .filter(([start]) => start > range[0]);
  return (index) =>
    index >= range[0] &&
    index < range[1] &&
    !nested.some(([open, close]) => index >= open && index < close);
}
