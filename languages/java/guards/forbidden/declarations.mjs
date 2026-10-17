import { lineAt } from '../../../../shared/conventions/lines.mjs';
import {
  closing,
  declaringBody,
  descriptorTypes,
  ownMember,
  parameterTypes,
  withoutAnnotations,
} from './java-source.mjs';

const DECLARATION_END = /^(?:\{|;|throws\b|default\b)/;
const NOT_A_DECLARATION = /[=()]|\b(?:return|new|throw|record)\b/;

function escaped(text) {
  return text.replaceAll(/[$.]/g, String.raw`\$&`);
}

function simpleName(qualified) {
  return qualified.split(/[.$]/).at(-1);
}

function prefixBefore(text, index) {
  const before = text.slice(0, index);
  const start = Math.max(before.lastIndexOf(';'), before.lastIndexOf('{'), before.lastIndexOf('}'));
  return before.slice(start + 1);
}

function methodCandidate(text, match, { naming, constructor }) {
  const prefix = prefixBefore(text, match.index);
  if (NOT_A_DECLARATION.test(prefix) || (!constructor && prefix.trim() === '')) {
    return undefined;
  }
  const open = match.index + match[0].length - 1;
  const close = closing(text, open);
  const parameters = close === -1 ? '' : text.slice(open + 1, close);
  const declared =
    close !== -1 &&
    DECLARATION_END.test(text.slice(close + 1).trimStart()) &&
    (naming.test(prefix) || naming.test(parameters));
  return declared ? { index: match.index, types: parameterTypes(parameters) } : undefined;
}

function typeScore(types, descriptor, constructor) {
  const alignments = constructor
    ? [descriptor.slice(0, types.length), descriptor.slice(descriptor.length - types.length)]
    : [descriptor];
  return Math.max(
    ...alignments.map((aligned) => aligned.filter((type, at) => type === types[at]).length),
  );
}

function methodIndexes(text, { declaration: { member }, className }, naming) {
  const name = member.split('(')[0];
  const constructor = name === '<init>';
  const declared = constructor ? simpleName(className) : name;
  const descriptor = descriptorTypes(member);
  const inClass = ownMember(text, declaringBody(className, text));
  return [...text.matchAll(new RegExp(String.raw`(?<![\w$.])${escaped(declared)}\s*\(`, 'g'))]
    .filter((match) => inClass(match.index))
    .map((match) => methodCandidate(text, match, { naming, constructor }))
    .filter((candidate) => candidate !== undefined)
    .filter(({ types }) =>
      constructor ? types.length <= descriptor.length : types.length === descriptor.length,
    )
    .map((candidate) => ({
      ...candidate,
      score: typeScore(candidate.types, descriptor, constructor),
    }))
    .sort((left, right) => right.score - left.score || right.types.length - left.types.length)
    .map((candidate) => candidate.index);
}

function classIndexes(text, className, naming) {
  const pattern = new RegExp(
    String.raw`\b(?:class|interface|enum|record)\s+${escaped(simpleName(className))}\b`,
    'g',
  );
  return [...text.matchAll(pattern)]
    .filter((match) => naming.test(text.slice(match.index).split('{')[0]))
    .map((match) => match.index);
}

function fieldIndexes(text, { declaration: { member }, className }, type) {
  const pattern = new RegExp(
    String.raw`\b${type}\b[\w\s<>[\],.?]*\b(${escaped(member)})\b(?!\s*\()`,
    'dg',
  );
  const inClass = ownMember(text, declaringBody(className, text));
  return [...text.matchAll(pattern)]
    .map((match) => match.indices[1][0])
    .filter((index) => inClass(index));
}

function declarationIndexes(use, text) {
  const type = escaped(simpleName(use.signature));
  const naming = new RegExp(String.raw`\b${type}\b`);
  const { kind } = use.declaration;
  if (kind === 'class') {
    return classIndexes(text, use.className, naming);
  }
  return kind === 'method' ? methodIndexes(text, use, naming) : fieldIndexes(text, use, type);
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

function declarationPlacer(textOf) {
  const texts = new Map();
  const taken = new Set();
  function textFor(file) {
    if (!texts.has(file)) {
      const text = textOf(file);
      texts.set(file, text === undefined ? undefined : withoutAnnotations(text));
    }
    return texts.get(file);
  }
  return (use) => {
    const text = textFor(use.file);
    const indexes = text === undefined ? [] : declarationIndexes(use, text);
    const index = indexes.find((candidate) => !taken.has(`${use.file}\0${String(candidate)}`));
    taken.add(`${use.file}\0${String(index)}`);
    return index === undefined ? use : { ...use, line: lineAt(text, index) };
  };
}

export function placeDeclarations(uses, textOf) {
  const place = declarationPlacer(textOf);
  const placed = uses.flatMap((use) => {
    if (use.declaration === undefined || isSynthetic(use)) {
      return use.declaration === undefined ? [use] : [];
    }
    return [place(use)];
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
