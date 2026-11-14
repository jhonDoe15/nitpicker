const BLANKED = /"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//gu;
const CONTROL = /^(?:if|for|while|switch|catch|synchronized|try|else|do)\b/u;
const ASSIGN = '\\s*(?:[-+*/|&^%]|<<|>>>?)?=(?!=)([^;]*);';

export function blanked(source) {
  return source.replaceAll(BLANKED, (text) => text.replaceAll(/[^\r\n]/gu, ' '));
}

function blocks(clean, offset) {
  const open = [];
  const closed = [];
  const depths = new Int32Array(clean.length + 1);
  let enclosing = [];
  for (const [index, character] of [...clean].entries()) {
    depths[index] = open.length;
    if (index === offset) {
      enclosing = [...open];
    }
    if (character === '{') {
      open.push(index);
    } else if (character === '}') {
      closed.push([open.pop(), index]);
    }
  }
  return { depths, closed, enclosing };
}

function headerOf(clean, start) {
  const boundary = Math.max(
    clean.lastIndexOf(';', start - 1),
    clean.lastIndexOf('{', start - 1),
    clean.lastIndexOf('}', start - 1),
  );
  return clean.slice(boundary + 1, start).trim();
}

function isMethodHeader(header) {
  return (
    !CONTROL.test(header) &&
    header
      .replace(/\bthrows\b[^()]*$/u, '')
      .trimEnd()
      .endsWith(')')
  );
}

function parametersOf(header) {
  const list = header.slice(header.indexOf('(') + 1, header.lastIndexOf(')'));
  return new Set([...list.matchAll(/([A-Za-z_$][\w$]*)\s*(?=,|$)/gu)].map((match) => match[1]));
}

function enclosingMethod({ clean, closed, enclosing }) {
  for (const start of enclosing.toReversed()) {
    const header = headerOf(clean, start);
    if (isMethodHeader(header)) {
      const end = closed.find(([from]) => from === start)?.[1] ?? clean.length;
      return { start, end, parameters: parametersOf(header) };
    }
  }
  return undefined;
}

export function analyseSource(source, offset) {
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
      const pattern = new RegExp(`(?<![\\w$.])${name.replaceAll('$', '\\$')}${ASSIGN}`, 'gud');
      return [...clean.matchAll(pattern)]
        .filter(({ index }) => {
          const inMethod = method !== undefined && index > method.start && index < method.end;
          return inMethod || structure.depths[index] === memberDepth;
        })
        .map((match) => source.slice(...match.indices[1]));
    },
  };
}
