export const END_TO_END_ROOT = 'e2e';

export function endToEndFor(
  layout: { readonly testRoots?: readonly string[] },
  testRoots: readonly string[],
  extensionGlob: string,
): {
  executedTestRoots: readonly string[];
  endToEndGlobs: string[];
  isEndToEndTest: (file: string) => boolean;
} {
  const isRoot = testRoots.includes(END_TO_END_ROOT);
  return {
    executedTestRoots:
      layout.testRoots === undefined
        ? testRoots.filter((root) => root !== END_TO_END_ROOT)
        : testRoots,
    endToEndGlobs: isRoot ? [`${END_TO_END_ROOT}/**/*.${extensionGlob}`] : [],
    isEndToEndTest: (file) =>
      isRoot && file.replaceAll('\\', '/').startsWith(`${END_TO_END_ROOT}/`),
  };
}
