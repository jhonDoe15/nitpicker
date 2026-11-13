import { leadingSpaces } from '../../conventions/lines.mjs';

const BRACE_LANGUAGES = new Set(['typescript', 'java', 'kotlin', 'go']);
const EXTENSIONS = {
  typescript: ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'],
  java: ['java'],
  kotlin: ['kt', 'kts'],
  python: ['py'],
  go: ['go'],
};
const LOOKAHEAD_LINES = 12;
const DEFAULT_INDENT = 2;
const LITERALS = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/.*$/gu;

export function languageOf(file) {
  const extension = file.split('.').at(-1);
  return Object.keys(EXTENSIONS).find((name) => EXTENSIONS[name].includes(extension));
}

export function extensionOf(file) {
  return file.split('.').at(-1);
}

export function linesOf(text) {
  return text.split(/\r?\n/u);
}

function braceChange(line) {
  const text = line.replaceAll(LITERALS, '');
  return {
    opens: [...text].filter((character) => character === '{').length,
    closes: [...text].filter((character) => character === '}').length,
  };
}

function braceBlockEnd(lines, startLine) {
  let depth = 0;
  let opened = false;
  for (const [offset, line] of lines.slice(startLine - 1).entries()) {
    const { opens, closes } = braceChange(line);
    depth += opens - closes;
    opened ||= opens > 0;
    if (opened && depth <= 0) {
      return startLine + offset;
    }
    if (!opened && offset + 1 >= LOOKAHEAD_LINES) {
      return startLine;
    }
  }
  return opened ? lines.length : startLine;
}

function indentBlockEnd(lines, startLine) {
  const base = leadingSpaces(lines[startLine - 1]);
  let end = startLine;
  for (const [offset, line] of lines.slice(startLine).entries()) {
    if (line.trim() === '') {
      continue;
    }
    if (leadingSpaces(line) <= base) {
      break;
    }
    end = startLine + offset + 1;
  }
  return end;
}

export function blockEnd(lines, startLine, language) {
  if (startLine < 1 || startLine > lines.length) {
    return startLine;
  }
  return BRACE_LANGUAGES.has(language)
    ? braceBlockEnd(lines, startLine)
    : indentBlockEnd(lines, startLine);
}

const TYPESCRIPT_DECLARATION = new RegExp(
  String.raw`^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?` +
    String.raw`(?:function\*?|class|interface|enum|type|const|let)\s+([\w$]+)`,
  'u',
);
const JAVA_TYPE =
  String.raw`^(?:(?:public|protected|private|static|final|abstract|sealed)\s)*` +
  String.raw`(?:class|interface|enum|record)\s(\w+)`;
const JAVA_METHOD =
  String.raw`^(?:(?:public|protected|private|static|final|abstract|synchronized|default)\s)+` +
  String.raw`(?:[\w<>[\],.?]+\s+)+(\w+)\(`;
const KOTLIN_DECLARATION = new RegExp(
  String.raw`^(?:(?:public|internal|private|protected|open|abstract|data|sealed|override|suspend|inline|enum)\s)*` +
    String.raw`(?:class|interface|object|fun)\s(?:<[^>]*>\s)?(?:[\w.]+\.)?(\w+)`,
  'u',
);
const DECLARATIONS = {
  typescript: [TYPESCRIPT_DECLARATION],
  java: [new RegExp(JAVA_TYPE, 'u'), new RegExp(JAVA_METHOD, 'u')],
  kotlin: [KOTLIN_DECLARATION],
  python: [/^(?:async\s+)?(?:def|class)\s+(\w+)/u],
  go: [/^(?:func\s+(?:\([^)]*\)\s*)?|type\s+)(\w+)/u],
};

function declaredName(language, text) {
  for (const pattern of DECLARATIONS[language] ?? []) {
    const name = pattern.exec(text)?.[1];
    if (name !== undefined) {
      return name;
    }
  }
  return undefined;
}

export function declarationsIn(lines, { language, from = 1, to = lines.length, indent = 0 }) {
  const found = [];
  let skipUntil = 0;
  for (const [offset, text] of lines.slice(0, to).entries()) {
    const line = offset + 1;
    const name =
      line < from || line <= skipUntil || leadingSpaces(text) !== indent
        ? undefined
        : declaredName(language, text.trimStart());
    if (name !== undefined) {
      const endLine = Math.min(blockEnd(lines, line, language), to);
      found.push({ name, startLine: line, endLine });
      skipUntil = endLine;
    }
  }
  return found;
}

export function bodyIndent(lines, { startLine, endLine }) {
  const body = lines.slice(startLine, endLine - 1).find((line) => line.trim() !== '');
  return body === undefined ? DEFAULT_INDENT : leadingSpaces(body);
}

export function largest(declarations, count) {
  return declarations
    .map((entry) => ({ ...entry, lines: entry.endLine - entry.startLine + 1 }))
    .toSorted((left, right) => right.lines - left.lines)
    .slice(0, count);
}

const MIN_BLOCK_LINES = 3;
const MAX_BLOCKS = 3;

function blankSeparated(lines, { startLine, endLine }) {
  const blocks = [];
  let from;
  for (const [offset, text] of lines.slice(startLine, endLine - 1).entries()) {
    const line = startLine + offset + 1;
    const blank = text.trim() === '';
    from = blank ? from : (from ?? line);
    const last = line === endLine - 1;
    if ((blank || last) && from !== undefined) {
      const to = blank ? line - 1 : line;
      blocks.push({ startLine: from, endLine: to, lines: to - from + 1 });
      from = undefined;
    }
  }
  return blocks;
}

export function candidateBlocks(lines, range) {
  return blankSeparated(lines, range)
    .filter(({ lines: size }) => size >= MIN_BLOCK_LINES)
    .toSorted((left, right) => right.lines - left.lines)
    .slice(0, MAX_BLOCKS)
    .toSorted((left, right) => left.startLine - right.startLine)
    .map(({ startLine, endLine }) => ({ startLine, endLine }));
}

const IMPORTS = [
  /\bfrom\s+['"]([^'"]+)['"]/u,
  /\bimport\s+['"]([^'"]+)['"]/u,
  /\brequire\(\s*['"]([^'"]+)['"]/u,
  /^\s*import\s+(?:static\s+)?([\w.*]+)/u,
  /^\s*from\s+([\w.]+)\s+import\b/u,
  /^\s*import\s+"([^"]+)"/u,
];

export function importSpecifier(line) {
  for (const pattern of IMPORTS) {
    const specifier = pattern.exec(line ?? '')?.[1];
    if (specifier !== undefined) {
      return specifier;
    }
  }
  return undefined;
}

export function sourceLine(finding, env) {
  const line = finding.location?.line;
  const text = env.read(finding.path);
  return line === undefined || text === undefined ? undefined : linesOf(text)[line - 1]?.trim();
}
