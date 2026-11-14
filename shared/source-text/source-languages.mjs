const PYTHON_OPERATORS = [
  '**=',
  '//=',
  '>>=',
  '<<=',
  '...',
  '->',
  ':=',
  '**',
  '//',
  '==',
  '!=',
  '<=',
  '>=',
  '<<',
  '>>',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '@=',
];

const JAVASCRIPT_OPERATORS = [
  '>>>=',
  '...',
  '===',
  '!==',
  '**=',
  '<<=',
  '>>=',
  '>>>',
  '&&=',
  '||=',
  '??=',
  '=>',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '??',
  '?.',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '**',
  '<<',
  '>>',
];

const JAVA_OPERATORS = [
  '>>>=',
  '<<=',
  '>>=',
  '>>>',
  '...',
  '->',
  '::',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '<<',
  '>>',
];

const KOTLIN_OPERATORS = [
  '!==',
  '===',
  '..<',
  '?.',
  '?:',
  '!!',
  '::',
  '..',
  '->',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
];

const GO_OPERATORS = [
  '&^=',
  '<<=',
  '>>=',
  '...',
  '&^',
  '<-',
  ':=',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '<<',
  '>>',
];

const SINGLE_LINE = { multiline: false, escapes: true };
const MULTILINE = { multiline: true, escapes: true };

const PYTHON_STRINGS = {
  start: /(?<prefix>[rRbBuUfFtT]{0,2})(?<opener>'''|"""|'|")/y,
  kinds: {
    "'": { ...SINGLE_LINE, close: "'" },
    '"': { ...SINGLE_LINE, close: '"' },
    "'''": { ...MULTILINE, close: "'''", block: true },
    '"""': { ...MULTILINE, close: '"""', block: true },
  },
};

const JAVASCRIPT_STRINGS = {
  start: /(?<opener>'|"|`)/y,
  kinds: {
    "'": { ...SINGLE_LINE, close: "'" },
    '"': { ...SINGLE_LINE, close: '"' },
    '`': { ...MULTILINE, close: '`', interpolation: '${', block: true, template: true },
  },
};

const JAVA_STRINGS = {
  start: /(?<opener>"""|"|')/y,
  kinds: {
    '"': { ...SINGLE_LINE, close: '"' },
    "'": { ...SINGLE_LINE, close: "'" },
    '"""': { ...MULTILINE, close: '"""', block: true },
  },
};

const KOTLIN_STRINGS = {
  start: /(?<opener>"""|"|'|`)/y,
  kinds: {
    '"': { ...SINGLE_LINE, close: '"', interpolation: '${' },
    "'": { ...SINGLE_LINE, close: "'" },
    '`': { multiline: false, escapes: false, close: '`' },
    '"""': { multiline: true, escapes: false, close: '"""', interpolation: '${', block: true },
  },
};

const GO_STRINGS = {
  start: /(?<opener>"|'|`)/y,
  kinds: {
    '"': { ...SINGLE_LINE, close: '"' },
    "'": { ...SINGLE_LINE, close: "'" },
    '`': { multiline: true, escapes: false, close: '`' },
  },
};

function operatorPattern(operators) {
  const escaped = operators.map((operator) => operator.replaceAll(/[$()*+.?[\\\]^{|}]/gu, '\\$&'));
  return new RegExp(`${escaped.join('|')}|[\\s\\S]`, 'uy');
}

const LANGUAGES = {
  python: {
    name: 'python',
    operators: operatorPattern(PYTHON_OPERATORS),
    strings: PYTHON_STRINGS,
    lineComment: '#',
    quoteAgnostic: true,
  },
  javascript: {
    name: 'javascript',
    operators: operatorPattern(JAVASCRIPT_OPERATORS),
    strings: JAVASCRIPT_STRINGS,
    lineComment: '//',
    blockComment: true,
    quoteAgnostic: true,
    regexLiterals: true,
  },
  java: {
    name: 'java',
    operators: operatorPattern(JAVA_OPERATORS),
    strings: JAVA_STRINGS,
    lineComment: '//',
    blockComment: true,
  },
  kotlin: {
    name: 'kotlin',
    operators: operatorPattern(KOTLIN_OPERATORS),
    strings: KOTLIN_STRINGS,
    lineComment: '//',
    blockComment: true,
    nestedComments: true,
  },
  go: {
    name: 'go',
    operators: operatorPattern(GO_OPERATORS),
    strings: GO_STRINGS,
    lineComment: '//',
    blockComment: true,
  },
};

const EXTENSIONS = [
  [/\.pyi?$/u, LANGUAGES.python],
  [/\.[cm]?[jt]sx?$/u, LANGUAGES.javascript],
  [/\.java$/u, LANGUAGES.java],
  [/\.kts?$/u, LANGUAGES.kotlin],
  [/\.go$/u, LANGUAGES.go],
];

export function sourceLanguage(filePath) {
  return EXTENSIONS.find(([pattern]) => pattern.test(filePath))?.[1];
}
