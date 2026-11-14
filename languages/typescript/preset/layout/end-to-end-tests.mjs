import { resolveLayoutFor } from '../layout.mjs';

const END_TO_END_NAME = /\.(?:e2e|integration)\.[^/]+$/u;
const END_TO_END_FOLDER = /^(?:e2e|integration|.+-e2e)$/u;

function underEndToEndFolder(file) {
  return file
    .split('/')
    .slice(0, -1)
    .some((segment) => END_TO_END_FOLDER.test(segment));
}

export function isIntegrationTestFor(file, policy) {
  if (file === undefined) {
    return false;
  }
  const normalized = file.replaceAll('\\', '/');
  const layout = resolveLayoutFor(policy);
  return (
    layout.isEndToEndTest(normalized) ||
    END_TO_END_NAME.test(normalized) ||
    underEndToEndFolder(normalized)
  );
}
