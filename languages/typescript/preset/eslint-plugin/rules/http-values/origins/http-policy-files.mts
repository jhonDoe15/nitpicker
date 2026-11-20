const FOLDER = 'languages/typescript/preset/eslint-plugin/rules/http-values';

export const HTTP_VALUE_POLICY_FILES = [
  'header-forms.mjs',
  'no-raw-http-value.mjs',
  'url-parts.mjs',
  'origins/header-tables.mjs',
  'origins/http-origins.mjs',
  'origins/http-policy-files.mjs',
  'origins/receivers.mjs',
].map((file) => `${FOLDER}/${file}`);
