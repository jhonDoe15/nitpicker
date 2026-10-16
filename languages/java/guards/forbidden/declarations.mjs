import { LITERAL_OR_COMMENT } from '../cpd-duplicates.mjs';

const ANNOTATION = /@[\w.]+(?:\s*\([^()]*\))?/g;
const DECLARATION_END = /^(?:\{|;|throws\b|default\b)/;
const NOT_A_DECLARATION = /[=()]|\b(?:return|new|throw)\b/;

export function blanked(source) {
  return source.replace(LITERAL_OR_COMMENT, (match) => match.replaceAll(/[^\n]/g, ' '));
}

function escaped(text) {
  return text.replaceAll(/[$.]/g, String.raw`\$&`);
}

function simpleName(qualified) {
  return qualified.split(/[.$]/).at(-1);
}

function lineAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function closingParen(text, open) {
  let depth = 0;
  for (const [offset, character] of [...text.slice(open)].entries()) {
    depth += { '(': 1, ')': -1 }[character] ?? 0;
    if (depth === 0) {
      return open + offset;
    }
  }
  return -1;
}

function sourceArity(parameters) {
  const bare = parameters.replace(ANNOTATION, ' ').trim();
  let depth = 0;
  let count = bare === '' ? 0 : 1;
  for (const character of bare) {
    depth += { '<': 1, '>': -1 }[character] ?? 0;
    count += character === ',' && depth === 0 ? 1 : 0;
  }
  return count;
}

function descriptorArity(member) {
  const inside = member.slice(member.indexOf('(') + 1, member.lastIndexOf(')'));
  return inside === '' ? 0 : inside.split(',').length;
}

function prefixBefore(text, index) {
  const before = text.slice(0, index);
  const start = Math.max(before.lastIndexOf(';'), before.lastIndexOf('{'), before.lastIndexOf('}'));
  return before.slice(start + 1).replace(ANNOTATION, ' ');
}

function methodCandidate(text, match, { naming, constructor }) {
  const prefix = prefixBefore(text, match.index);
  if (NOT_A_DECLARATION.test(prefix) || (!constructor && prefix.trim() === '')) {
    return undefined;
  }
  const open = match.index + match[0].length - 1;
  const close = closingParen(text, open);
  const parameters = close === -1 ? '' : text.slice(open + 1, close);
  const declared =
    close !== -1 &&
    DECLARATION_END.test(text.slice(close + 1).trimStart()) &&
    (naming.test(prefix) || naming.test(parameters));
  return declared ? { index: match.index, arity: sourceArity(parameters) } : undefined;
}

function methodIndex(text, { declaration: { member }, className }, naming) {
  const name = member.split('(')[0];
  const constructor = name === '<init>';
  const declared = constructor ? simpleName(className) : name;
  const arity = descriptorArity(member);
  const candidates = [
    ...text.matchAll(new RegExp(String.raw`(?<![\w$.])${escaped(declared)}\s*\(`, 'g')),
  ]
    .map((match) => methodCandidate(text, match, { naming, constructor }))
    .filter((candidate) => candidate !== undefined)
    .filter((candidate) => (constructor ? candidate.arity <= arity : candidate.arity === arity));
  return candidates.sort((left, right) => right.arity - left.arity)[0]?.index;
}

function classIndex(text, className, naming) {
  const pattern = new RegExp(
    String.raw`\b(?:class|interface|enum|record)\s+${escaped(simpleName(className))}\b`,
    'g',
  );
  return [...text.matchAll(pattern)].find((match) =>
    naming.test(text.slice(match.index).split('{')[0]),
  )?.index;
}

function fieldIndex(text, member, type) {
  const pattern = new RegExp(
    String.raw`\b${type}\b[\w\s<>[\],.?]*\b(${escaped(member)})\b(?!\s*\()`,
    'd',
  );
  return pattern.exec(text)?.indices[1][0];
}

function declarationIndex(use, text) {
  const type = escaped(simpleName(use.signature));
  const naming = new RegExp(String.raw`\b${type}\b`);
  const { kind, member } = use.declaration;
  if (kind === 'class') {
    return classIndex(text, use.className, naming);
  }
  return kind === 'method' ? methodIndex(text, use, naming) : fieldIndex(text, member, type);
}

function ownClassIndex(className, text) {
  return new RegExp(
    String.raw`\b(?:class|interface|enum|record)\s+${escaped(simpleName(className))}\b`,
  ).exec(text)?.index;
}

function classLine(className, text) {
  const parts = className.split('$');
  const index = parts
    .map((_, dropped) => ownClassIndex(parts.slice(0, parts.length - dropped).join('$'), text))
    .find((found) => found !== undefined);
  return index === undefined ? undefined : lineAt(text, index);
}

function isSynthetic(use) {
  return use.declaration.kind !== 'class' && use.declaration.member.split('(')[0].includes('$');
}

function accessorOf(use, field) {
  const name = use.declaration.member.split('(')[0];
  const fieldName = field.declaration.member;
  const capital = `${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`;
  return [
    '<init>',
    fieldName,
    `get${capital}`,
    `set${capital}`,
    `is${capital}`,
    `with${capital}`,
  ].includes(name);
}

function generatedFrom(use, field, text) {
  if (use.className === field.className) {
    return accessorOf(use, field);
  }
  return (
    use.className.startsWith(`${field.className}$`) &&
    ownClassIndex(use.className, text) === undefined
  );
}

function coveredByField(use, placed, text) {
  return placed.some(
    (other) =>
      ['field', 'record component'].includes(other.declaration?.kind) &&
      other.signature === use.signature &&
      generatedFrom(use, other, text ?? ''),
  );
}

export function placeDeclarations(uses, textOf) {
  const placed = uses.flatMap((use) => {
    if (use.declaration === undefined || isSynthetic(use)) {
      return use.declaration === undefined ? [use] : [];
    }
    const text = textOf(use.file);
    const index = text === undefined ? undefined : declarationIndex(use, text);
    return [index === undefined ? use : { ...use, line: lineAt(text, index) }];
  });
  return placed.flatMap((use) => {
    if (use.declaration === undefined || use.line !== undefined) {
      return [use];
    }
    const text = textOf(use.file);
    if (use.declaration.kind !== 'class' && coveredByField(use, placed, text)) {
      return [];
    }
    const line = text === undefined ? undefined : classLine(use.className, text);
    return [line === undefined ? use : { ...use, line }];
  });
}
