export const FOCUSED_RULE = 'FocusedTest';
export const FOCUSED_MESSAGE =
  'Remove the focus from this test: a Kotest name with the "f:" prefix and the f-prefixed registrations (ftest, fcontext, fdescribe, fit, fshould, fgiven) make Kotest run only the focused tests of the spec, so the rest of the suite is skipped while the build stays green. Run one test while you work with the IDE or a Gradle `--tests` filter, and commit the test without the focus.';

const FOCUS_PREFIX = /^f:/u;

function isFocused(node) {
  return node.prefix === 'f' || FOCUS_PREFIX.test(node.name);
}

export function focusedTests(suites) {
  const nodes = suites
    .flatMap((suite) => suite.nodes)
    .filter(({ framework }) => framework === 'kotest');
  const marked = new Set(nodes.filter(isFocused).map(({ offset }) => offset));
  return nodes
    .filter(
      (node) => marked.has(node.offset) && !node.ancestors.some((offset) => marked.has(offset)),
    )
    .map(({ symbol, offset }) => ({ symbol, offset }));
}
