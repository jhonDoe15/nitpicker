const KEYWORDS = new RegExp(
  String.raw`\b(?:and|or|not|in|is|if|else|elif|for|while|with|as|lambda|return|raise|import|from|def|class` +
    String.raw`|try|except|finally|del|assert|pass|break|continue|yield|await|async|None|True|False)\b`,
  'gu',
);
const STRING_LITERAL = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gu;
const GROUP = /\([^()]*\)|\[[^[\]]*\]|\{[^{}]*\}/gu;
const WORD_RUN = /\b\w+\s+\w+\b/u;
const SPACED_CALL = /[\w\])]\s+\(/u;
const NEUTRAL = /^(?:[\])}]+,?)?$/u;
const BLOCK_HEADER = /^(?:if|elif|while|with|except|match|case)\b/u;
const FOR_HEADER = /^(?:async\s+)?for\s.*\sin\s/u;
const BARE_HEADER = /^(?:else|try|finally)\s*:$/u;
const DEFINITION = /^(?:def|class|async\s+def)\b/u;
const IMPORT = /^(?:import\s+[\w.]+(?:\s+as\s+\w+)?|from\s+[\w.]+\s+import\s+\S[\w*, ()]*)$/u;
const ASSIGNMENT = /^[A-Za-z_][\w.]*(?:\[[^\]]*\])*\s*(?::[^=]+)?[-+*/%|&^@]?=(?!=)\s*(\S.*)$/u;
const RICH_VALUE = /[([{"']/u;
const CALL = /^[A-Za-z_][\w.]*\(.*\)$/u;
const STATEMENT = /^(?:return|raise|assert|del|pass|break|continue)\b.*$/u;
const DIRECTIVE = new RegExp(
  String.raw`(?:^|#)\s*(?:!|-\*-|noqa\b|type:|pragma\b|fmt:|yapf:|pyright:|pylance|mypy:|ruff:|isort:|pylint:` +
    String.raw`|flake8:|nosec\b|nosemgrep\b|skipcq\b|sourcery\b|pytype:|cython:|distutils:|autopep8:|black:` +
    String.raw`|region\b|endregion\b|pyre-|coding[:=]|vim?:|TODO\b|FIXME\b|noinspection\b|language=)`,
  'iu',
);

const PROSE = 'prose';
const STRONG = 'strong';
const WEAK = 'weak';
const NEUTRAL_SHAPE = 'neutral';

export type Shape = typeof NEUTRAL_SHAPE | typeof STRONG | typeof WEAK | typeof PROSE;

function isHeader(text: string): boolean {
  return (
    BARE_HEADER.test(text) ||
    (text.endsWith(':') && (BLOCK_HEADER.test(text) || FOR_HEADER.test(text)))
  );
}

function withoutGroups(text: string): string {
  return ['', '', ''].reduce((rest) => rest.replaceAll(GROUP, ''), text);
}

function readsAsProse(text: string): boolean {
  const masked = text.replaceAll(STRING_LITERAL, '""').replaceAll(KEYWORDS, '~');
  return SPACED_CALL.test(masked) || WORD_RUN.test(withoutGroups(masked));
}

export function shapeOf(line: string): Shape {
  const text = line
    .trim()
    .replace(/^#+\s?/u, '')
    .trim();
  if (NEUTRAL.test(text)) {
    return NEUTRAL_SHAPE;
  }
  if (DIRECTIVE.test(line) || readsAsProse(text)) {
    return PROSE;
  }
  const value = ASSIGNMENT.exec(text)?.[1];
  if (IMPORT.test(text) || DEFINITION.test(text)) {
    return STRONG;
  }
  if (isHeader(text)) {
    return WEAK;
  }
  if (value !== undefined) {
    return RICH_VALUE.test(value) ? STRONG : WEAK;
  }
  return CALL.test(text) || STATEMENT.test(text) ? WEAK : PROSE;
}

export function confidentlyCode(lines: readonly string[]): boolean {
  const shapes = lines.map(shapeOf);
  const code = shapes.filter((shape) => shape !== NEUTRAL_SHAPE);
  return !shapes.includes(PROSE) && (shapes.includes(STRONG) || code.length > 1);
}
