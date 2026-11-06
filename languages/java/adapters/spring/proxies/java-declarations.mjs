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

function depthStep(character) {
  return (OPEN.has(character) ? 1 : 0) - (CLOSE.has(character) ? 1 : 0);
}

export function closingOf(text, open) {
  let depth = 0;
  for (const match of text.slice(open).matchAll(BRACKETS)) {
    depth += depthStep(match[0]);
    if (depth === 0) {
      return open + match.index;
    }
  }
  return text.length;
}

export function topLevel(text) {
  let depth = 0;
  return text
    .split('')
    .map((character) => {
      depth -= CLOSE.has(character) ? 1 : 0;
      const kept = depth === 0 ? character : ' ';
      depth += OPEN.has(character) ? 1 : 0;
      return kept;
    })
    .join('');
}

function headerBefore(text, index) {
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

function annotationsIn(header) {
  return [...topLevel(header).matchAll(ANNOTATION)]
    .map((match) => match[1].replaceAll(/\s/gu, ''))
    .filter((name) => name !== 'interface');
}

function bodyOpening(text, from) {
  let depth = 0;
  for (const match of text.slice(from).matchAll(BODY_START)) {
    depth += depthStep(match[0]);
    if (depth === 0 && (match[0] === '{' || match[0] === ';')) {
      return match[0] === '{' ? from + match.index : -1;
    }
  }
  return -1;
}

function bodyClosing(text, open) {
  let depth = 0;
  for (const match of text.slice(open).matchAll(BRACES)) {
    depth += match[0] === '{' ? 1 : -1;
    if (depth === 0) {
      return open + match.index;
    }
  }
  return text.length;
}

/** The types a Java source declares, nested ones by binary name, with the annotations on each. */
export function typeDeclarations(text, packageName) {
  const declared = [...text.matchAll(TYPE_DECLARATION)].map((match) => {
    const open = bodyOpening(text, match.index + match[0].length);
    return {
      name: match[2],
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

function binaryName(parts) {
  const outer = parts.findIndex((part) => /^\p{Lu}/u.test(part));
  return outer < 0
    ? parts.join('.')
    : [parts.slice(0, outer + 1).join('.'), ...parts.slice(outer + 1)].join('$');
}

/** The candidate qualified names of an annotation or type name written in a Java source. */
export function javaResolver(text, packageName, declaredTypes) {
  const explicit = new Map();
  const stars = [];
  for (const match of text.matchAll(IMPORT)) {
    if (match[2] === undefined) {
      explicit.set(match[1].split('.').at(-1), match[1]);
    } else {
      stars.push(match[1]);
    }
  }
  const local = new Map(declaredTypes.map((type) => [type.name, type.qualified]));
  return (name) => {
    const [first, ...rest] = name.split('.');
    if (explicit.has(first)) {
      return [binaryName([...explicit.get(first).split('.'), ...rest])];
    }
    if (local.has(first)) {
      return [[local.get(first), ...rest].join('$')];
    }
    if (QUALIFIED.test(name)) {
      return [name];
    }
    const packaged = packageName === '' ? name : `${packageName}.${name}`;
    return [packaged, ...stars.map((prefix) => `${prefix}.${name}`)];
  };
}
