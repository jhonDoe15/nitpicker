const WORDS = { and: 'and', or: 'or', not: 'not ' };
const SYMBOLS = { and: '&&', or: '||', not: '!' };
const SIMPLE = new Set(['name', 'literal', 'this', 'member', 'index', 'call']);
const STRENGTH = new Map([
  ['||', 'or'],
  ['or', 'or'],
  ['&&', 'and'],
  ['and', 'and'],
]);
const NEGATIONS = new Set(['!', 'not']);

function isSimple(node) {
  return SIMPLE.has(node.kind) || (node.kind === 'unary' && NEGATIONS.has(node.value));
}

function isTight(node, operator) {
  if (isSimple(node)) {
    return true;
  }
  if (node.kind !== 'binary') {
    return false;
  }
  const own = STRENGTH.get(node.value);
  if (own === undefined) {
    return node.value !== '??';
  }
  return own === operator || own === 'and';
}

function grouped(node, operator) {
  return isTight(node, operator) ? node.text : `(${node.text})`;
}

function spelling(file) {
  return file.endsWith('.py') ? WORDS : SYMBOLS;
}

/** The condition `a || b || ...` (`a or b` in Python): operands that bind looser are parenthesized. */
export function joined(nodes, operator, file) {
  const words = spelling(file);
  return nodes.map((node) => grouped(node, operator)).join(` ${words[operator]} `);
}

/** The negation of a condition: a leading `!` or `not` is removed, anything else gets one. */
export function negated(node, file) {
  if (node.kind === 'unary' && NEGATIONS.has(node.value) && node.children[0].text !== undefined) {
    return node.children[0].text;
  }
  const text = isSimple(node) && node.kind !== 'unary' ? node.text : `(${node.text})`;
  return `${spelling(file).not}${text}`;
}

/** The `if` head around a condition text, as the file's language writes it. */
export function ifHead(text, file) {
  if (file.endsWith('.py')) {
    return `if ${text}:`;
  }
  return file.endsWith('.go') ? `if ${text}` : `if (${text})`;
}
