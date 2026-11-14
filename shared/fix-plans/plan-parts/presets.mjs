export const TYPESCRIPT_PRESETS = Object.freeze(['typescript', 'javascript']);
export const JVM_PRESETS = Object.freeze(['java', 'kotlin']);
export const PYTHON_PRESETS = Object.freeze(['python']);
export const KOTLIN_PRESETS = Object.freeze(['kotlin']);
export const ALL_PRESETS = Object.freeze([
  ...TYPESCRIPT_PRESETS,
  ...JVM_PRESETS,
  ...PYTHON_PRESETS,
  'go',
]);
