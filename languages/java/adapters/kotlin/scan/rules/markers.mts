import { hasGeneratorHeader } from '../../../../../../shared/conventions/generator-marker.mjs';
import { afterGroup } from '../kotlin-source.mts';
import type { Comment, Scanned } from '../typed/scan-shapes.mts';

type Marker = {
  rule: string;
  offset: number;
  subject: string;
  end: number;
};
type CodeMarker = Marker & { confident: boolean };
type Step = { rest: string; next: number | undefined };

const ANNOTATION = /(?<![\w`])@([A-Za-z_]\w*:)?(?:[A-Za-z_]\w*\.)*([A-Za-z_]\w*)/g;
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
const DECLARATION_KEYWORD = /^(?:(?:class|interface|object|fun|constructor)\b|(?:get|set)\s*\()/;
const MUTATION_MARKERS = new Set(['DoNotMutate', 'CoverageIgnore']);
const GENERATED_HEADER = /@generated\b|\bgenerated\b[\s\S]+\bdo not (?:edit|modify)\b/i;

const MARKER_MESSAGES = {
  GeneratedOnHandWrittenCode: `Remove the annotation from hand-written code: JaCoCo skips code carrying an annotation whose name contains Generated, and PIT skips @Generated, so this is not measured. Put the JPA @GeneratedValue on the field.`,
  JvmSyntheticOnHandWrittenCode:
    'Remove @JvmSynthetic: JaCoCo skips synthetic functions, so this is not measured. An exception fits only a library function that must stay hidden from Java callers.',
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
  /^(?:this\.)?[a-z_]\w*(?:\.[a-z_]\w*)*\s*[-+*/%]?=\s*[^=\s].*$/,
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
const IDE_DIRECTIVE = String.raw`language\s*=\s*[A-Za-z]\w*(?:\s+(?:prefix|suffix)=.*)?$|noinspection\b`;
const NOT_CODE = new RegExp(String.raw`^(?:@|https?:|TODO\b|FIXME\b|[-*>#]|\{@|${IDE_DIRECTIVE})`);
const EXAMPLE_HEADING =
  /^(?:(?:examples?|usage|samples?)(?:\s+(?:usage|code))?\s*(?::|$)|(?:e\.g\.|for example)\s*(?:[,:]|$))/i;
const STRING_LITERAL = /"(?:\\.|[^"\\\n])*"/g;
const OPENERS = new Set(['(', '[']);
const CLOSERS = new Set([')', ']']);
const WORD_RUN = /\b(?:[a-z]{2,}|\d+)\s+[a-z]{2,}\b/;
const KOTLIN_WORD_LIST = [
  ...['if', 'else', 'when', 'try', 'catch', 'is', 'in', 'as', 'by', 'to', 'and', 'or'],
  ...['shl', 'shr', 'ushr', 'xor', 'until', 'downTo', 'step', 'object', 'return', 'throw'],
  ...['null', 'true', 'false', 'this', 'super', 'new', 'it', 'var', 'val', 'fun', 'const'],
  'lateinit',
];
const KOTLIN_WORDS = new RegExp(String.raw`\b(?:${KOTLIN_WORD_LIST.join('|')})\b`, 'g');
const VALUE_SHAPES = new Set([0, 2]);
const CONTROL_SHAPE = 3;
const STRONG_SHAPES = new Set([0, 3, 4, 5, 6, 7]);
const NEUTRAL_LINE = /^(?:[\]})]+[,;]?)?$/;

export function generatedFile(scanned: Scanned): boolean {
  const header = scanned.comments.find(({ start }) => scanned.code.slice(0, start).trim() === '');
  return (
    (header !== undefined && GENERATED_HEADER.test(header.text)) ||
    hasGeneratorHeader(scanned.source)
  );
}

function skipArguments(code: string, at: number): number {
  return afterGroup(code, at, /^\s*\(/);
}

function nextStep(code: string, at: number): Step {
  const rest = code.slice(at).trimStart();
  const start = code.length - rest.length;
  const step = LEADING_ANNOTATION.exec(rest) ?? LEADING_MODIFIER.exec(rest);
  if (step === null) {
    return { rest, next: undefined };
  }
  const end = start + step[0].length;
  return { rest, next: step[0].startsWith('@') ? skipArguments(code, end) : end };
}

function annotatesDeclaration(code: string, start: number): boolean {
  const steps = [nextStep(code, start)];
  for (const { next } of steps) {
    if (next !== undefined) {
      steps.push(nextStep(code, next));
    }
  }
  return DECLARATION_KEYWORD.test(steps.at(-1)?.rest ?? '');
}

function hidesFromCoverage(name: string): string | undefined {
  if (name === 'JvmSynthetic') {
    return 'JvmSyntheticOnHandWrittenCode';
  }
  return name.includes('Generated') ? 'GeneratedOnHandWrittenCode' : undefined;
}

function coverageMarker(code: string, match: RegExpExecArray): string | undefined {
  const [text, target, name = ''] = match;
  const rule = hidesFromCoverage(name);
  if (rule === undefined || target === 'file:') {
    return undefined;
  }
  const marks =
    METHOD_TARGETS.has(target ?? '') ||
    annotatesDeclaration(code, skipArguments(code, match.index + text.length));
  return marks ? rule : undefined;
}

export function annotationMarkers(scanned: Scanned): Marker[] {
  return [...scanned.code.matchAll(ANNOTATION)].flatMap((match) => {
    const { index, 2: name = '' } = match;
    const rule = coverageMarker(scanned.code, match);
    if (rule !== undefined) {
      return [
        {
          rule,
          offset: index,
          subject: name,
          end: skipArguments(scanned.code, index + match[0].length),
        },
      ];
    }
    return MUTATION_MARKERS.has(name)
      ? [
          {
            rule: 'MutationIgnoreMarker',
            offset: index,
            subject: name,
            end: skipArguments(scanned.code, index + match[0].length),
          },
        ]
      : [];
  });
}

function bodyLines(comment: Comment): string[] {
  if (comment.kind === 'line') {
    return [comment.text.trim()];
  }
  return comment.text.split('\n').map((line) => line.replace(/^\s*\*+\s?/, '').trim());
}

function startsNextLine(scanned: Scanned, previous: Comment, next: Comment): boolean {
  return (
    previous.kind === 'line' &&
    next.kind === 'line' &&
    /^[ \t]*\n[ \t]*$/.test(scanned.source.slice(previous.end, next.start))
  );
}

function commentGroups(scanned: Scanned): Comment[][] {
  const groups: Comment[][] = [];
  for (const comment of scanned.comments.filter(({ kind }) => kind !== 'doc')) {
    const last = groups.at(-1);
    const tail = last?.at(-1);
    if (last !== undefined && tail !== undefined && startsNextLine(scanned, tail, comment)) {
      last.push(comment);
    } else {
      groups.push([comment]);
    }
  }
  return groups;
}

function withoutGroups(text: string): string {
  let depth = 0;
  let kept = '';
  for (const char of text) {
    if (OPENERS.has(char)) {
      depth += 1;
    } else if (CLOSERS.has(char)) {
      depth = Math.max(depth - 1, 0);
    } else if (depth === 0) {
      kept += char;
    }
  }
  return kept;
}

function readsAsProse(text: string): boolean {
  const keywordsMarked = text.replaceAll(STRING_LITERAL, '""').replaceAll(KOTLIN_WORDS, '~');
  return WORD_RUN.test(withoutGroups(keywordsMarked));
}

function codeShape(text: string): number {
  if (text === '' || SENTENCE.test(text) || NOT_CODE.test(text)) {
    return -1;
  }
  const shape = CODE_SHAPES.findIndex((candidate) => candidate.test(text));
  return shape !== -1 && !(VALUE_SHAPES.has(shape) && readsAsProse(text)) ? shape : -1;
}

function isCodeLine(text: string): boolean {
  return codeShape(text) !== -1;
}

function isStrongShape(shape: number, text: string): boolean {
  return STRONG_SHAPES.has(shape) && (shape !== CONTROL_SHAPE || text.endsWith('{'));
}

function confidentlyCode(lines: string[]): boolean {
  const texts = lines.filter((line) => !NEUTRAL_LINE.test(line));
  const shapes = texts.map(codeShape);
  return (
    shapes.length > 0 &&
    !shapes.includes(-1) &&
    shapes.some((shape, at) => isStrongShape(shape, texts[at] ?? ''))
  );
}

function firstCodeLine(lines: string[]): number {
  let fenced = false;
  let example = { open: false, started: false };
  return lines.findIndex((line) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return false;
    }
    if (EXAMPLE_HEADING.test(line)) {
      example = { open: true, started: false };
      return false;
    }
    if (line === '' && example.started) {
      example = { open: false, started: false };
    } else if (line !== '') {
      example.started = true;
    }
    return !fenced && !example.open && isCodeLine(line);
  });
}

export function commentedOutCode(scanned: Scanned): CodeMarker[] {
  return commentGroups(scanned).flatMap((group): CodeMarker[] => {
    const lines = group.flatMap(bodyLines);
    const index = firstCodeLine(lines);
    const [head] = group;
    const tail = group.at(-1);
    return index === -1 || head === undefined || tail === undefined
      ? []
      : [
          {
            rule: 'CommentedOutCode',
            offset: head.start,
            subject: lines[index] ?? '',
            end: tail.end,
            confident: confidentlyCode(lines),
          },
        ];
  });
}

export const kotlinSourceRules = {
  messages: MARKER_MESSAGES,
  main: [annotationMarkers, commentedOutCode],
  test: [commentedOutCode],
};
