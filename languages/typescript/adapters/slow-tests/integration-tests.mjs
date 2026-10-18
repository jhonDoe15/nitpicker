const TESTS_FOLDER = /(?:^|\/)__tests__\/(.*)$/u;
const INTEGRATION_FOLDER =
  /(?:^|\/)(?:__)?(?:integrations?|e2e|end-to-end|functional|acceptance|system)(?:[-_]tests?)?(?:__)?\//u;
const INTEGRATION_SUFFIX = /(?:^|[./_-])(?:integration|e2e|int|it)\.(?:test|spec)\.[cm]?[jt]sx?$/u;

function belowTestRoot(file, layout) {
  const roots = layout.testRoots.map((root) => `${root}/`);
  const root = roots.find((prefix) => file.startsWith(prefix));
  return root === undefined ? TESTS_FOLDER.exec(file)?.[1] : file.slice(root.length);
}

export function isIntegrationTest(file, layout) {
  const below = belowTestRoot(file, layout);
  return (
    layout.isEndToEndTest(file) ||
    INTEGRATION_SUFFIX.test(file) ||
    (below !== undefined && INTEGRATION_FOLDER.test(below))
  );
}
