const JAVASCRIPT_PRESET = 'javascript';

export const JAVASCRIPT_EXTENSIONS = ['js', 'mjs', 'cjs'];

export const TYPESCRIPT_EXTENSIONS_IN_JAVASCRIPT_PROJECT = ['ts', 'mts', 'cts'];

export const JAVASCRIPT_COMPILER_OPTIONS = { allowJs: true, checkJs: true };

export const JAVASCRIPT_JSCPD_FORMAT = 'javascript';

const JAVASCRIPT_GLOB = `{${JAVASCRIPT_EXTENSIONS.join(',')}}`;

export const JAVASCRIPT_KNIP_ENTRIES = [
  `src/main.${JAVASCRIPT_GLOB}`,
  `src/server.${JAVASCRIPT_GLOB}`,
  `src/main/main.${JAVASCRIPT_GLOB}`,
  `src/main/server.${JAVASCRIPT_GLOB}`,
  `vitest.config.${JAVASCRIPT_GLOB}`,
  `src/main/vitest.config.${JAVASCRIPT_GLOB}`,
  `test/vitest.config.${JAVASCRIPT_GLOB}`,
  `tests/vitest.config.${JAVASCRIPT_GLOB}`,
  `test/fixtures/*harness*.${JAVASCRIPT_GLOB}`,
  `tests/fixtures/*harness*.${JAVASCRIPT_GLOB}`,
];

export const JAVASCRIPT_KNIP_PROJECT = [`*.config.${JAVASCRIPT_GLOB}`];

export function isJavascriptPolicy(policy) {
  return policy?.preset === JAVASCRIPT_PRESET;
}
