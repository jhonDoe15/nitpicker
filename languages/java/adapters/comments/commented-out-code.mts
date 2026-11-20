type Comment = {
  readonly kind: 'line' | 'doc' | 'block';
  readonly text: string;
  readonly start: number;
  readonly end: number;
};
type BodyLine = { readonly text: string; readonly offset: number };
type RemovableCode = { readonly offset: number; readonly start: number; readonly end: number };
type CodeComment = { readonly offset: number; readonly subject: string };

const TOKEN = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g;
const MODIFIERS =
  '(?:(?:public|private|protected|static|final|abstract|synchronized|default)\\s+)*';
const ANNOTATIONS = '(?:@[A-Z]\\w*(?:\\([^)]*\\))?\\s+)*';
const PRIMITIVE = 'int|long|short|byte|char|float|double|boolean|String';
const TYPE = '[A-Za-z_][\\w.]*(?:<[^=;()]*>)?(?:\\[\\])*';
const CALL =
  '(?:[A-Za-z_][\\w.]*|new\\s+[A-Z]\\w*(?:<[^>]*>)?)(?:<[^>]*>)?\\((?:[^()]|\\([^()]*\\))*\\)';
const CODE_SHAPES = [
  {
    pattern: new RegExp(`^${ANNOTATIONS}${MODIFIERS}${TYPE}\\s+[A-Za-z_]\\w*\\s*=\\s*\\S.*;$`),
    guarded: true,
  },
  {
    pattern: /^[A-Za-z_][\w.]*(?:\[[^\]]*\])*\s*(?:[-+*/%&|^]|<<|>>>?)?=\s*[^=\s].*;$/,
    guarded: true,
  },
  {
    pattern: new RegExp(`^${CALL}(?:\\s*\\.\\s*[a-z]\\w*\\((?:[^()]|\\([^()]*\\))*\\))*;$`),
    guarded: false,
  },
  { pattern: /^(?:return|throw)\b.*;$/, guarded: true },
  { pattern: /^(?:break|continue)(?:\s+\w+)?;$/, guarded: false },
  { pattern: /^(?:(?:\+\+|--)[A-Za-z_][\w.]*|[A-Za-z_][\w.]*(?:\+\+|--));$/, guarded: false },
  { pattern: /^(?:\}\s*)?(?:if|for|while|switch|synchronized)\s*\(.*\)\s*\{?$/, guarded: false },
  { pattern: /^(?:\}\s*)?(?:else(?:\s+if\s*\(.*\))?|try|finally)\s*\{$/, guarded: false },
  { pattern: /^\}\s*catch\s*\(.*\)\s*\{$/, guarded: false },
  { pattern: /^try\s*\(.*\)\s*\{$/, guarded: false },
  {
    pattern: new RegExp(
      `^${ANNOTATIONS}(?:[\\w<>[\\],.?]+\\s+)+[a-z]\\w*\\s*\\([^)]*\\)\\s*(?:throws [\\w., ]+)?\\{$`,
    ),
    guarded: false,
  },
  {
    pattern: new RegExp(
      `^${ANNOTATIONS}${MODIFIERS}(?:class|interface|enum|record)\\s+[A-Z].*\\{$`,
    ),
    guarded: false,
  },
  { pattern: /^(?:import|package)\s+(?:static\s+)?[\w.]+(?:\.\*)?;$/, guarded: false },
  {
    pattern: new RegExp(
      `^${ANNOTATIONS}${MODIFIERS}(?:${PRIMITIVE}|[A-Z]\\w*(?:<[^=;()]*>)?)(?:\\[\\])*\\s+[a-z_]\\w*;$`,
    ),
    guarded: true,
  },
];
const COMMENT_DELIMITER_LENGTH = 2;
const SENTENCE = /^[A-Z][a-z]+ [a-z]+ [a-z]+/;
const NOT_CODE = /^(?:@(?![A-Z])|https?:|TODO\b|FIXME\b|[-*>#]|\{@|noinspection\b|language\s*=)/;
const FENCE = /^(?:```|~~~)/;
const EXAMPLE_HEADING =
  /^(?:(?:examples?|usage|samples?)(?:\s+(?:usage|code))?\s*(?::|$)|(?:e\.g\.|for example)\s*(?:[,:]|$))/i;
const STRING_LITERAL = /"(?:\\.|[^"\\\n])*"/g;
const KEYWORD_LIST = [
  ...['public', 'private', 'protected', 'final', 'new', 'return', 'throw', 'null', 'true', 'false'],
  ...['this', 'super', 'var', 'int', 'long', 'short', 'byte', 'char', 'float', 'double', 'boolean'],
  ...['void', 'static', 'instanceof', 'else'],
];
const KEYWORDS = new RegExp(String.raw`\b(?:${KEYWORD_LIST.join('|')})\b`, 'g');
const TRAILING_NOTE = /\s+\/\/.*$/;
const PROSE_VALUE = /=\s*[\w."'-]+\s+(?!instanceof\b)[A-Za-z]\w*\s*;$/;
const STRONG_SHAPES = new Set([0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
const CONTROL_SHAPE = 6;
const NEUTRAL_LINE = /^(?:[\]})]+[,;]?)?$/;
const DIRECTIVE =
  /\bCHECKSTYLE:|\bNOSONAR\b|\bnoinspection\b|@formatter:|\blanguage\s*=|\bNOPMD\b|\bTODO\b|\bFIXME\b/;
const WORD_RUN = /\b[a-z]{2,}\s+[a-z]{2,}\b/;

function withoutGroups(text: string): string {
  let depth = 0;
  let kept = '';
  for (const char of text) {
    if (char === '(' || char === '[' || char === '<') {
      depth += 1;
    } else if (char === ')' || char === ']' || char === '>') {
      depth = Math.max(depth - 1, 0);
    } else if (depth === 0) {
      kept += char;
    }
  }
  return kept;
}

function readsAsProse(text: string): boolean {
  const plain = text.replaceAll(STRING_LITERAL, '""').replaceAll(KEYWORDS, '~');
  return PROSE_VALUE.test(plain) || WORD_RUN.test(withoutGroups(plain));
}

function codeShape(text: string): number {
  if (text === '' || SENTENCE.test(text) || NOT_CODE.test(text)) {
    return -1;
  }
  const code = text.replace(TRAILING_NOTE, '');
  const at = CODE_SHAPES.findIndex(({ pattern }) => pattern.test(code));
  const shape = CODE_SHAPES[at];
  return shape !== undefined && !(shape.guarded && readsAsProse(code)) ? at : -1;
}

function isCodeLine(text: string): boolean {
  return codeShape(text) !== -1;
}

function confidentlyCode(lines: readonly BodyLine[]): boolean {
  let strong = false;
  for (const { text } of lines) {
    if (NEUTRAL_LINE.test(text)) {
      continue;
    }
    const shape = codeShape(text);
    if (shape === -1 || DIRECTIVE.test(text)) {
      return false;
    }
    strong ||= STRONG_SHAPES.has(shape) && (shape !== CONTROL_SHAPE || text.endsWith('{'));
  }
  return strong;
}

function bodyLines(comment: Comment): BodyLine[] {
  if (comment.kind === 'line') {
    return [{ text: comment.text.slice(2).trim(), offset: comment.start }];
  }
  let at = comment.start + 2;
  return comment.text
    .slice(COMMENT_DELIMITER_LENGTH, -COMMENT_DELIMITER_LENGTH)
    .split('\n')
    .map((line) => {
      const entry = { text: line.replace(/^\s*\*+\s?/, '').trim(), offset: at };
      at += line.length + 1;
      return entry;
    });
}

function commentsOf(source: string): Comment[] {
  return [...source.matchAll(TOKEN)].flatMap((match): Comment[] => {
    const [text] = match;
    const end = match.index + text.length;
    if (text.startsWith('//')) {
      return [{ kind: 'line', text, start: match.index, end }];
    }
    return text.startsWith('/*')
      ? [{ kind: text.startsWith('/**') ? 'doc' : 'block', text, start: match.index, end }]
      : [];
  });
}

function groupsOf(source: string, comments: readonly Comment[]): Comment[][] {
  const groups: Comment[][] = [];
  for (const comment of comments) {
    const group = groups.at(-1);
    const last = group?.at(-1);
    const adjacent =
      last?.kind === 'line' &&
      comment.kind === 'line' &&
      /^[ \t]*\n[ \t]*$/.test(source.slice(last.end, comment.start));
    if (adjacent && group !== undefined) {
      group.push(comment);
    } else {
      groups.push([comment]);
    }
  }
  return groups;
}

function firstCodeLine(lines: readonly BodyLine[]): BodyLine | undefined {
  let fenced = false;
  let example = { open: false, started: false };
  return lines.find(({ text }) => {
    if (FENCE.test(text)) {
      fenced = !fenced;
      return false;
    }
    if (EXAMPLE_HEADING.test(text)) {
      example = { open: true, started: false };
      return false;
    }
    if (text === '' && example.started) {
      example = { open: false, started: false };
    } else if (text !== '') {
      example.started = true;
    }
    return !fenced && !example.open && isCodeLine(text);
  });
}

export function commentLines(source: string): BodyLine[] {
  return commentsOf(source).flatMap(bodyLines);
}

export function commentedOutCode(source: string): CodeComment[] {
  const plain = commentsOf(source).filter(({ kind }) => kind !== 'doc');
  return groupsOf(source, plain).flatMap((group) => {
    const line = firstCodeLine(group.flatMap(bodyLines));
    return line === undefined ? [] : [{ offset: line.offset, subject: line.text }];
  });
}

export function removableCode(source: string): RemovableCode[] {
  const plain = commentsOf(source).filter(({ kind }) => kind !== 'doc');
  return groupsOf(source, plain).flatMap((group) => {
    const lines = group.flatMap(bodyLines);
    const first = firstCodeLine(lines);
    const head = group.find(
      ({ start, end }) => first !== undefined && start <= first.offset && first.offset < end,
    );
    const tail = group.at(-1);
    if (first === undefined || head === undefined || tail === undefined) {
      return [];
    }
    const run = group.length === 1 ? lines : lines.slice(lines.indexOf(first));
    return confidentlyCode(run) ? [{ offset: first.offset, start: head.start, end: tail.end }] : [];
  });
}
