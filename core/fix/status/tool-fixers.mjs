const TYPESCRIPT_PRESETS = ['typescript', 'javascript'];
const JVM_PRESETS = ['java', 'kotlin'];
const FORMAT = 'format';

export const FORMATTER_RULES = Object.freeze([
  { tool: 'prettier-format', rule: 'prettier/prettier', presets: TYPESCRIPT_PRESETS },
  { tool: 'google-java-format', rule: FORMAT, presets: JVM_PRESETS },
  { tool: 'palantir-java-format', rule: FORMAT, presets: JVM_PRESETS },
  { tool: 'ktfmt', rule: FORMAT, presets: ['kotlin'] },
  { tool: 'ruff-format', rule: FORMAT, presets: ['python'] },
]);
