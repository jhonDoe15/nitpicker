const TEST_FOLDER =
  /(?:^|\/)(?:__tests__|__mocks__|__fixtures__|tests?|specs?|test-support|test-utils|test-helpers|testing)\//iu;
const TEST_SUFFIX = /\.(?:test|spec|stories|story)\.[cm]?[jt]sx?$/iu;

export function isTestFile(filename: string): boolean {
  const normalized = filename.replaceAll('\\', '/');
  return TEST_FOLDER.test(normalized) || TEST_SUFFIX.test(normalized);
}
