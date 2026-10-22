import { calledNames } from '../../../../../source/assertions.mjs';
import { closingIndex } from '../../../scan/kotlin-source.mjs';
import { bracketBalance } from '../discovery/declarations.mjs';
import { repeatUntil } from '../discovery/repeat.mjs';

export const CONTROL_FLOW_RULE = 'AssertionInControlFlow';
export const CONTROL_FLOW_MESSAGE =
  'Assert unconditionally. An assertion inside an if, a when or a loop over a literal list of cases may not run, or runs for fewer cases than you think, so the test can pass without checking anything. Split the cases into separate tests or one parameterized test (@ParameterizedTest with @MethodSource or @CsvSource, Kotest withData) and assert every time; narrow a type with assertIs or assertNotNull instead of an if. A loop over the results of the code under test is fine. An exception fits only a loop whose cases are generated at run time and cannot be listed.';

const ASSERTION_NAME =
  /^(?:(?:assert|verify|coVerify|expect|should)(?:[A-Z]\w*)?|andExpect|verifyAll|coVerifyAll)$/u;
const IF = /(?<![\w.`])if\s*(?=\()/gu;
const WHEN = /(?<![\w.`])when\s*(?=[({])/gu;
const FOR = /(?<![\w.`])for\s*(?=\()/gu;
const FOR_EACH = /\.\s*(?:forEach|forEachIndexed|onEach|forEachEntry)\s*(?=\{)/gu;
const ELSE = /^\s*else\b\s*/u;
const IF_HEAD = /^if\s*\(/u;
const CONTINUATION = /^\s*(?:\.|\?[.:]|&&|\|\|)/u;
const CHAIN_START = /^\s*(?:\.|\?\.)/u;
const COLLECTION_BUILDERS = [
  'listOf',
  'setOf',
  'mutableListOf',
  'mutableSetOf',
  'arrayOf',
  'intArrayOf',
  'longArrayOf',
  'doubleArrayOf',
  'charArrayOf',
  'booleanArrayOf',
  'sequenceOf',
  'mapOf',
  'mutableMapOf',
  'linkedMapOf',
  'hashMapOf',
  'arrayListOf',
  'listOfNotNull',
  String.raw`Arguments\.of`,
];
const LITERAL_COLLECTION = new RegExp(String.raw`\b(?:${COLLECTION_BUILDERS.join('|')})\b`, 'u');
const COLLECTION_ROOT = /^\s*(?:this\.)?([A-Za-z_]\w*)(?:\s*\.\s*\w+(?:\(\))?)*\s*$/u;
const MAX_ELSE_CHAIN = 50;
const MAX_CHAIN_LINES = 20;

function singleStatementEnd(code, from) {
  let depth = 0;
  for (const [offset, char] of code.slice(from).split('').entries()) {
    const index = from + offset;
    depth += '({['.includes(char) ? 1 : 0;
    depth -= ')}]'.includes(char) ? 1 : 0;
    const next = code.slice(index + 1, code.indexOf('\n', index + 1));
    if (char === '\n' && depth <= 0 && !CONTINUATION.test(next)) {
      return index;
    }
  }
  return code.length;
}

function bodyEnd(code, from) {
  const start = from + code.slice(from).search(/\S|$/u);
  return code[start] === '{' ? closingIndex(code, start) + 1 : singleStatementEnd(code, start);
}

function conditionEnd(code, ifIndex) {
  return closingIndex(code, code.indexOf('(', ifIndex)) + 1;
}

function ifEnd(code, ifIndex) {
  const state = { end: bodyEnd(code, conditionEnd(code, ifIndex)) };
  repeatUntil(MAX_ELSE_CHAIN, () => {
    const tail = ELSE.exec(code.slice(state.end));
    if (tail === null) {
      return true;
    }
    const from = state.end + tail[0].length;
    const next = IF_HEAD.test(code.slice(from)) ? conditionEnd(code, from) : from;
    state.end = bodyEnd(code, next);
    return false;
  });
  return state.end;
}

function whenEnd(code, whenIndex) {
  const afterHead = whenIndex + code.slice(whenIndex).search(/[({]/u);
  const open =
    code[afterHead] === '(' ? code.indexOf('{', closingIndex(code, afterHead)) : afterHead;
  return closingIndex(code, open) + 1;
}

function continuesUpward(text) {
  return bracketBalance(text) < 0 || text.trim() === '' || CHAIN_START.test(text);
}

function receiverText(code, dotIndex, floor) {
  const state = { start: code.lastIndexOf('\n', dotIndex) + 1 };
  state.text = code.slice(state.start, dotIndex);
  repeatUntil(MAX_CHAIN_LINES, () => {
    if (state.start <= floor || !continuesUpward(state.text)) {
      return true;
    }
    state.start = code.lastIndexOf('\n', state.start - 2) + 1;
    state.text = code.slice(state.start, dotIndex);
    return false;
  });
  return state.text;
}

function declaredAsCases(code, name) {
  const declaration = new RegExp(
    String.raw`\b(?:val|var)\s+${name}\b[^=\n]*=\s*([^\n]*)`,
    'u',
  ).exec(code);
  return declaration !== null && LITERAL_COLLECTION.test(declaration[1]);
}

function isCaseTable(code, expression) {
  if (LITERAL_COLLECTION.test(expression)) {
    return true;
  }
  const root = COLLECTION_ROOT.exec(expression)?.[1];
  return root !== undefined && declaredAsCases(code, root);
}

function hasAssertion(code, from, to) {
  return calledNames(code.slice(from, to), 'kotlin').some((name) => ASSERTION_NAME.test(name));
}

function conditionals(code, start, end) {
  const slice = code.slice(start, end);
  const ifs = [...slice.matchAll(IF)].map((match) => ({
    construct: 'if',
    from: start + match.index,
    to: ifEnd(code, start + match.index),
  }));
  const whens = [...slice.matchAll(WHEN)].map((match) => ({
    construct: 'when',
    from: start + match.index,
    to: whenEnd(code, start + match.index),
  }));
  return [...ifs, ...whens].map((entry) => ({ ...entry, cases: true }));
}

function loopSource(header) {
  const at = header.search(/\bin\b/u);
  return at < 0 ? '' : header.slice(at + 2);
}

function forLoops(code, start, end) {
  return [...code.slice(start, end).matchAll(FOR)].map((match) => {
    const from = start + match.index;
    const open = from + match[0].length;
    const close = closingIndex(code, open);
    const source = loopSource(code.slice(open + 1, close));
    return {
      construct: 'for',
      from,
      to: bodyEnd(code, close + 1),
      cases: isCaseTable(code, source),
    };
  });
}

function forEachLoops(code, start, end) {
  return [...code.slice(start, end).matchAll(FOR_EACH)].map((match) => {
    const from = start + match.index;
    const open = from + match[0].length;
    const receiver = receiverText(code, from, start);
    return {
      construct: 'forEach',
      from,
      to: closingIndex(code, open) + 1,
      cases: isCaseTable(code, receiver),
    };
  });
}

export function assertionsInControlFlow(scanned, body) {
  const { code } = scanned;
  const found = [
    ...conditionals(code, body.start, body.end),
    ...forLoops(code, body.start, body.end),
    ...forEachLoops(code, body.start, body.end),
  ]
    .filter(
      (entry) =>
        entry.cases && entry.to <= body.end + 1 && hasAssertion(code, entry.from, entry.to),
    )
    .toSorted((left, right) => left.from - right.from);
  return found.filter(
    (entry, index) =>
      !found.slice(0, index).some((outer) => outer.from <= entry.from && entry.to <= outer.to),
  );
}
