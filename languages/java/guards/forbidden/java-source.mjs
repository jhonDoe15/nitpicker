const ANNOTATION_START = /@(?!interface\b)[\w.]+\s*/g;
const TYPE_DECLARATION = /\b(?:class|interface|enum|record)\s+([\w$]+)/g;
const PARAMETER = /([\w.$]+)((?:\s*\[\s*\])*)\s+[\w$]+((?:\s*\[\s*\])*)$/;

function spaces(text) {
  return text.replaceAll(/[^\n]/g, ' ');
}

export function closing(text, open, [opening, closingCharacter] = '()') {
  let depth = 0;
  for (const [offset, character] of [...text.slice(open)].entries()) {
    depth += { [opening]: 1, [closingCharacter]: -1 }[character] ?? 0;
    if (depth === 0) {
      return open + offset;
    }
  }
  return -1;
}

export function withoutAnnotations(text) {
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

function topLevelParts(parameters) {
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

export function parameterTypes(parameters) {
  return topLevelParts(parameters).map((parameter) => {
    const bare = parameter.replaceAll(/\bfinal\b/g, ' ').replace('...', '[] ');
    const match = PARAMETER.exec(bare.trim());
    return match === null
      ? bare.trim()
      : `${match[1].split('.').at(-1)}${`${match[2]}${match[3]}`.replaceAll(/\s/g, '')}`;
  });
}

export function descriptorTypes(member) {
  const inside = member.slice(member.indexOf('(') + 1, member.lastIndexOf(')'));
  return inside === '' ? [] : inside.split(',').map((type) => type.trim().split(/[.$]/).at(-1));
}

function typeBodies(text, [from, to]) {
  return [...text.slice(0, to).matchAll(TYPE_DECLARATION)]
    .filter((match) => match.index >= from)
    .map((match) => {
      const open = text.indexOf('{', match.index);
      const close = open === -1 ? -1 : closing(text, open, '{}');
      return { name: match[1], open, span: [match.index, close === -1 ? to : close] };
    })
    .filter(({ open }) => open !== -1 && open < to);
}

export function declaringBody(className, text) {
  const parts = className.split('.').at(-1).split('$');
  let range = [0, text.length];
  for (const part of parts.map((name) => name.replace(/^\d+/, ''))) {
    const found = typeBodies(text, range).find(({ name }) => name === part);
    if (part === '' || found === undefined) {
      return range;
    }
    range = found.span;
  }
  return range;
}

export function ownMember(text, range) {
  const nested = typeBodies(text, range)
    .map(({ span }) => span)
    .filter(([start]) => start > range[0]);
  return (index) =>
    index >= range[0] &&
    index < range[1] &&
    !nested.some(([open, close]) => index >= open && index < close);
}
