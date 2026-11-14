import { closingIndex } from '../../../../adapters/kotlin/scan/kotlin-source.mjs';
import { kotlinRecipe } from '../shared/kotlin-recipe.mjs';

const RULE = 'FocusedTest';
const KOTEST = /^[ \t]*import[ \t]+io\.kotest\b/mu;
const FOCUSED_CALL = /(?<![\w.])f(test|context|describe|it|should|given)(?=\s*\()/gu;

function extent(code, from) {
  const open = code.indexOf('(', from);
  const close = open === -1 ? code.length : closingIndex(code, open);
  const lambda = /^\s*\{/u.exec(code.slice(close + 1));
  return lambda === null ? close : closingIndex(code, close + lambda[0].length);
}

function calls(code) {
  return [...code.matchAll(FOCUSED_CALL)].map((match) => ({
    start: match.index,
    end: extent(code, match.index),
    edit: { start: match.index, end: match.index + 1, text: '' },
  }));
}

function names({ code, literals }) {
  return literals.flatMap((literal) => {
    const prefix = /^f:[ \t]*/u.exec(literal.text);
    const lambda = /^\s*(?:-\s*)?\{/u.exec(code.slice(literal.end));
    return prefix === null || literal.raw || lambda === null
      ? []
      : [
          {
            start: literal.start,
            end: closingIndex(code, literal.end + lambda[0].length - 1),
            edit: {
              start: literal.bodyStart,
              end: literal.bodyStart + prefix[0].length,
              text: '',
            },
          },
        ];
  });
}

export const focusedTestRecipe = kotlinRecipe({
  id: 'kotlin-focused-test',
  rules: [{ tool: 'pmd', rule: RULE }],
  where: 'test',
  find(scanned) {
    if (!KOTEST.test(scanned.code)) {
      return [];
    }
    const marked = [...calls(scanned.code), ...names(scanned)].toSorted(
      (left, right) => left.start - right.start,
    );
    return marked
      .filter((mark) => !marked.some((other) => other.start < mark.start && mark.start < other.end))
      .map(({ start, edit }) => ({ offset: start, edits: [edit] }));
  },
});
