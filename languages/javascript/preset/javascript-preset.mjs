const JAVASCRIPT_PRESET = 'javascript';

export const JAVASCRIPT_COMPILER_OPTIONS = { allowJs: true, checkJs: true };

export const JAVASCRIPT_JSCPD_FORMATS = ['javascript', 'jsx'];

export const JAVASCRIPT_KNIP_ENTRIES = [
  'src/main.{js,mjs,cjs}',
  'src/server.{js,mjs,cjs}',
  'src/main/main.{js,mjs,cjs}',
  'src/main/server.{js,mjs,cjs}',
  'vitest.config.{js,mjs,cjs}',
  'src/main/vitest.config.{js,mjs,cjs}',
  'test/vitest.config.{js,mjs,cjs}',
  'tests/vitest.config.{js,mjs,cjs}',
  'test/fixtures/*harness*.{js,mjs,cjs}',
  'tests/fixtures/*harness*.{js,mjs,cjs}',
];

export const JAVASCRIPT_KNIP_PROJECT = ['*.config.{js,mjs,cjs}'];

export function isJavascriptPolicy(policy) {
  return policy?.preset === JAVASCRIPT_PRESET;
}
