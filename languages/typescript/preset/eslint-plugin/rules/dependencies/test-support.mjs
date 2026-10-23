const TEST_SUPPORT_FOLDER =
  /(?:^|\/)(?:__mocks__|__tests__|__fixtures__|test-support|test-utils|test-helpers|testing|\.storybook)\//u;
const TEST_SUPPORT_FILE =
  /^(?:setup-?tests?|test-?setup|(?:vitest|jest)\.setup|test-?utils)\.[cm]?[jt]sx?$/iu;
const STORY_FILE = /\.(?:stories|story)\.[cm]?[jt]sx?$/iu;

export function isTestSupportFile(relativePath) {
  const base = relativePath.split('/').at(-1) ?? '';
  return (
    TEST_SUPPORT_FOLDER.test(relativePath) || TEST_SUPPORT_FILE.test(base) || STORY_FILE.test(base)
  );
}
