import path from 'node:path';

const INTEGRATION_MARKERS = new Set([
  'integration',
  'integrations',
  'e2e',
  'end_to_end',
  'functional',
  'acceptance',
  'system',
]);
const INTEGRATION_FOLDER =
  /(?:^|\/)(?:integrations?|e2e|end[-_]to[-_]end|functional|acceptance|system)(?:[-_]tests?)?\//u;
const INTEGRATION_FILE = /(?:^|_)(?:integration|e2e)(?:_|\.py$)/u;
const INTEGRATION_CLASS = /(?:Integration|E2E|EndToEnd)/u;

export function isIntegrationTest({ file, classes, markers }) {
  return (
    markers.some((marker) => INTEGRATION_MARKERS.has(marker)) ||
    INTEGRATION_FOLDER.test(file) ||
    INTEGRATION_FILE.test(path.posix.basename(file)) ||
    classes.some((name) => INTEGRATION_CLASS.test(name))
  );
}
