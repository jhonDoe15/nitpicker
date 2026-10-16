const INTEGRATION_FOLDER =
  /(?:^|\/)(?:__)?(?:integrations?|e2e|end-to-end|functional|acceptance|system)(?:[-_]tests?)?(?:__)?\//u;
const INTEGRATION_SUFFIX = /(?:^|[./_-])(?:integration|e2e|int|it)\.(?:test|spec)\.[cm]?[jt]sx?$/u;

export function isIntegrationTest(file, layout) {
  return (
    layout.isEndToEndTest(file) || INTEGRATION_FOLDER.test(file) || INTEGRATION_SUFFIX.test(file)
  );
}
