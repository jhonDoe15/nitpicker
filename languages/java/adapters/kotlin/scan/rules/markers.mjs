import { hasGeneratorHeader } from '../../../../../../shared/conventions/generator-marker.mjs';
import { closingIndex } from '../kotlin-source.mjs';

const ANNOTATION = /@([A-Za-z_]\w*:)?(?:[A-Za-z_]\w*\.)*([A-Za-z_]\w*)/g;
const METHOD_TARGETS = new Set(['get:', 'set:']);
const DECLARATION_MODIFIERS = [
  'public',
  'private',
  'internal',
  'protected',
  'open',
  'abstract',
  'sealed',
  'final',
  'data',
  'enum',
  'annotation',
  'value',
  'inline',
  'inner',
  'companion',
  'override',
  'suspend',
  'operator',
  'infix',
  'tailrec',
  'external',
  'expect',
  'actual',
];
const LEADING_MODIFIER = new RegExp(String.raw`^(?:${DECLARATION_MODIFIERS.join('|')})\s+`);
const LEADING_ANNOTATION = /^@(?:[A-Za-z_]\w*:)?[\w.]+/;
const DECLARATION_KEYWORD = /^(?:class|interface|object|fun|constructor)\b/;
const MUTATION_MARKERS = new Set(['DoNotMutate', 'CoverageIgnore']);
const GENERATED_HEADER = /@generated\b|\bgenerated\b[\s\S]*\bdo not (?:edit|modify)\b/i;

export const MARKER_MESSAGES = {
  GeneratedOnHandWrittenCode:
    'Remove the annotation from hand-written code: JaCoCo and PIT skip a class, function or constructor annotated @Generated, so this is not measured.',
  MutationIgnoreMarker:
    'Remove the annotation and kill the mutants with a test: PIT does not mutate code annotated @DoNotMutate or @CoverageIgnore.',
  CommentedOutCode: 'Delete the commented-out code; version control keeps it.',
};

const DECLARATION = '(?:val|var|const\\s+val)\\s+[a-z_]\\w*(?:\\s*:[\\w<>?,. ]+|\\s*)=\\s*\\S.*';
const MODIFIERS =
  '(?:(?:private|public|internal|protected|override|suspend|inline|open|abstract)\\s+)*';
const CODE_SHAPES = [
  new RegExp(`^${DECLARATION}$`),
  /^[a-z_][\w.]*(?:<[^>]*>)?\((?:[^()]|\([^()]*\))*\)(?:\s*\.\s*[a-z]\w*\((?:[^()]|\([^()]*\))*\))*\s*$/,
  /^(?:this\.)?[a-z_]\w*(?:\.[a-z_]\w*)*\s*(?:[-+*/%]?=)\s*[^=\s].*$/,
  /^(?:\}\s*)?(?:if|for|while|when)\s*\(.*\)\s*\{?$/,
  /^(?:\}\s*)?(?:else|try|finally)\s*\{$/,
  /^\}\s*catch\s*\(.*\)\s*\{$/,
  new RegExp(`^${MODIFIERS}fun\\s+[\\w.<>]+\\(.*\\)(?:\\s*:[\\w<>?, .]+|\\s*)(?:\\{|=.+)$`),
  /^(?:(?:data|sealed|abstract|open|private|internal|enum|value)\s+)*(?:class|interface|object)\s+[A-Z].*\{$/,
  /^(?:import|package)\s+[\w.]+(?:\.\*)?$/,
  /^(?:return|throw)\s+[\w.]+\(.*\)$/,
  /^return\s+(?:null|true|false|-?\d+)$/,
];
const SENTENCE = /^[A-Z][a-z]+ [a-z]+ [a-z]+/;
const FENCE = /^(?:```|~~~)/;
const NOT_CODE = /^(?:@|https?:|TODO\b|FIXME\b|[-*>#]|\{@)/;

export function generatedFile(scanned) {
  const header = scanned.comments.find(({ start }) => scanned.code.slice(0, start).trim() === '');
  return (
    (header !== undefined && GENERATED_HEADER.test(header.text)) ||
    hasGeneratorHeader(scanned.source)
  );
}

function skipArguments(code, at) {
  const open = /^\s*\(/.exec(code.slice(at));
  return open === null ? at : closingIndex(code, at + open[0].length - 1) + 1;
}

function nextStep(code, at) {
  const rest = code.slice(at).trimStart();
  const start = code.length - rest.length;
  const step = LEADING_ANNOTATION.exec(rest) ?? LEADING_MODIFIER.exec(rest);
  if (step === null) {
    return { rest, next: undefined };
  }
  const end = start + step[0].length;
  return { rest, next: step[0].startsWith('@') ? skipArguments(code, end) : end };
}

function annotatesDeclaration(code, start) {
  const steps = [nextStep(code, start)];
  for (const { next } of steps) {
    if (next !== undefined) {
      steps.push(nextStep(code, next));
    }
  }
  return DECLARATION_KEYWORD.test(steps.at(-1).rest);
}

function isGeneratedMarker(code, match) {
  const [text, target, name] = match;
  if (name !== 'Generated' || target === 'file:') {
    return false;
  }
  return (
    METHOD_TARGETS.has(target) ||
    annotatesDeclaration(code, skipArguments(code, match.index + text.length))
  );
}

export function annotationMarkers(scanned) {
  return [...scanned.code.matchAll(ANNOTATION)].flatMap((match) => {
    const { index, 2: name } = match;
    if (isGeneratedMarker(scanned.code, match)) {
      return [{ rule: 'GeneratedOnHandWrittenCode', offset: index, subject: name }];
    }
    return MUTATION_MARKERS.has(name)
      ? [{ rule: 'MutationIgnoreMarker', offset: index, subject: name }]
      : [];
  });
}

function bodyLines(comment) {
  if (comment.kind === 'line') {
    return [comment.text.trim()];
  }
  return comment.text.split('\n').map((line) => line.replace(/^\s*\*+\s?/, '').trim());
}

function startsNextLine(scanned, previous, next) {
  return (
    previous.kind === 'line' &&
    next.kind === 'line' &&
    /^[ \t]*\n[ \t]*$/.test(scanned.source.slice(previous.end, next.start))
  );
}

function commentGroups(scanned) {
  const groups = [];
  for (const comment of scanned.comments.filter(({ kind }) => kind !== 'doc')) {
    const last = groups.at(-1);
    if (last !== undefined && startsNextLine(scanned, last.at(-1), comment)) {
      last.push(comment);
    } else {
      groups.push([comment]);
    }
  }
  return groups;
}

function isCodeLine(text) {
  if (text === '' || SENTENCE.test(text) || NOT_CODE.test(text)) {
    return false;
  }
  return CODE_SHAPES.some((shape) => shape.test(text));
}

function firstCodeLine(lines) {
  let fenced = false;
  return lines.findIndex((line) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return false;
    }
    return !fenced && isCodeLine(line);
  });
}

export function commentedOutCode(scanned) {
  return commentGroups(scanned).flatMap((group) => {
    const lines = group.flatMap(bodyLines);
    const index = firstCodeLine(lines);
    return index === -1
      ? []
      : [{ rule: 'CommentedOutCode', offset: group[0].start, subject: lines[index] }];
  });
}
