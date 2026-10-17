const INTEGRATION_MARKERS = new Set([
  'integration',
  'integrations',
  'e2e',
  'end_to_end',
  'functional',
  'acceptance',
  'system',
]);
const TESTS_FOLDER = /(?:^|\/)tests?\/(.*)$/u;
const INTEGRATION_FOLDER =
  /(?:^|\/)(?:integrations?|e2e|end[-_]to[-_]end|functional|acceptance|system)(?:[-_]tests?)?\//u;
const INTEGRATION_FILE = /(?:^|_)(?:integration|e2e)(?:_|\.py$)/u;
const INTEGRATION_CLASS =
  /^(?:Test)?(?:Integration|E2E|EndToEnd)|(?:Integration|E2E|EndToEnd)(?:Tests?)?$/u;

function belowTestsFolder(file) {
  return TESTS_FOLDER.exec(file)?.[1];
}

export function isIntegrationTest({ file, classes, markers }) {
  const below = belowTestsFolder(file);
  return (
    markers.some((marker) => INTEGRATION_MARKERS.has(marker)) ||
    (below !== undefined && INTEGRATION_FOLDER.test(below)) ||
    INTEGRATION_FILE.test(file.split('/').pop()) ||
    classes.some((name) => INTEGRATION_CLASS.test(name))
  );
}
