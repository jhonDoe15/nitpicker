const CLASS_HEADER = /\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/u;
const COMMENTS_AND_LITERALS =
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/gu;

function blank(text) {
  return text.replaceAll(COMMENTS_AND_LITERALS, (match) => match.replaceAll(/[^\n]/gu, ' '));
}

function lineStarts(text) {
  const starts = [0];
  for (const [index, character] of [...text].entries()) {
    if (character === '\n') {
      starts.push(index + 1);
    }
  }
  return starts;
}

function lineOf(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (starts[middle] <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low + 1;
}

function isAssignment(text, index) {
  return text[index] === '=' && text[index + 1] !== '=' && !'=!<>'.includes(text[index - 1] ?? '');
}

function scanMember(text, start) {
  let parentheses = 0;
  let braces = 0;
  let equals = -1;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (character === '(') {
      parentheses += 1;
    } else if (character === ')') {
      parentheses -= 1;
    } else if (parentheses === 0 && equals < 0 && isAssignment(text, index)) {
      equals = index;
    } else if (character === '{') {
      if (equals < 0 && braces === 0) {
        return { kind: 'block', at: index, header: text.slice(start, index).trim() };
      }
      braces += 1;
    } else if (character === '}') {
      if (braces === 0) {
        return { kind: 'close', at: index };
      }
      braces -= 1;
    } else if (character === ';' && parentheses === 0 && braces === 0) {
      return { kind: 'statement', at: index, equals, header: text.slice(start, index) };
    }
  }
  return undefined;
}

function skipBlock(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') {
      depth += 1;
    } else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return text.length;
}

function fieldName(header, equalsOffset) {
  return /([A-Za-z_$][\w$]*)\s*(?:\[\s*\]\s*)*$/u.exec(header.slice(0, equalsOffset))?.[1];
}

function parseBody(context, start, className) {
  const { text, starts, file, units } = context;
  let index = start;
  while (index < text.length) {
    const member = scanMember(text, index);
    if (member === undefined || member.kind === 'close') {
      return member === undefined ? text.length : member.at + 1;
    }
    const first = text.slice(index).search(/\S/u) + index;
    if (member.kind === 'statement') {
      const name = member.equals < 0 ? undefined : fieldName(member.header, member.equals - index);
      if (name !== undefined && className !== undefined) {
        units.push({
          file,
          name: `${className}.${name}`,
          start: lineOf(starts, first),
          end: lineOf(starts, member.at),
        });
      }
      index = member.at + 1;
      continue;
    }
    const end = skipOrParse(context, member, className);
    const initializer =
      member.header === '' ? '<init>' : member.header === 'static' ? '<clinit>' : undefined;
    if (initializer !== undefined && className !== undefined) {
      units.push({
        file,
        name: `${className}.${initializer}`,
        start: lineOf(starts, first),
        end: lineOf(starts, end - 1),
      });
    }
    index = end;
  }
  return text.length;
}

function skipOrParse(context, member, className) {
  const declared = CLASS_HEADER.exec(member.header)?.[1];
  if (declared === undefined) {
    return skipBlock(context.text, member.at);
  }
  return parseBody(
    context,
    member.at + 1,
    className === undefined ? declared : `${className}.${declared}`,
  );
}

/**
 * The parts of a Java file that run without being a method: field initializers (`Class.field`,
 * lambdas included), `static { }` blocks (`Class.<clinit>`) and instance initializer blocks
 * (`Class.<init>`), as `{ file, name, start, end }` line ranges. Lizard reports the methods.
 */
export function javaDeclarationUnits(file, source) {
  const text = blank(source);
  const units = [];
  parseBody({ text, starts: lineStarts(text), file, units }, 0, undefined);
  return units;
}
