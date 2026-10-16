const SOURCE_FILES = ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];
const COMPONENT_EXTENSIONS = new Set(['tsx', 'jsx']);
const FRAMEWORK_PREFIX = /^[[_+$@(#~]/;

const CASING_PATTERNS = {
  'kebab-case': /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  camelCase: /^[a-z][a-zA-Z0-9]*$/,
  PascalCase: /^[A-Z][a-zA-Z0-9]*$/,
  snake_case: /^[a-z0-9]+(?:_[a-z0-9]+)*$/,
};

export const FILE_NAME_CASINGS = Object.keys(CASING_PATTERNS);

export const FILE_NAME_CONVENTION = {
  id: 'typescript.fileNames',
  label: 'File names',
  options: FILE_NAME_CASINGS,
  optionLabels: Object.fromEntries(FILE_NAME_CASINGS.map((casing) => [casing, casing])),
  fallback: 'kebab-case',
  files: SOURCE_FILES,
  measure: fileNameVote,
};

export function fileNameCasingOption(conventions = {}) {
  return conventions[FILE_NAME_CONVENTION.id] ?? FILE_NAME_CONVENTION.fallback;
}

export function fileNameParts(file) {
  const name = file.split(/[\\/]/).pop();
  const firstDot = name.indexOf('.');
  const base = firstDot === -1 ? name : name.slice(0, firstDot);
  const rest = firstDot === -1 ? '' : name.slice(firstDot + 1);
  return { name, base, segments: rest.split('.'), extension: rest.split('.').pop() };
}

export function fittingCasings(base) {
  return FILE_NAME_CASINGS.filter((casing) => CASING_PATTERNS[casing].test(base));
}

function isExemptFileName(file) {
  const { base, segments, extension } = fileNameParts(file);
  return (
    base === '' ||
    FRAMEWORK_PREFIX.test(base) ||
    segments[0] === 'config' ||
    (COMPONENT_EXTENSIONS.has(extension) && isOnly(fittingCasings(base), 'PascalCase'))
  );
}

export function fileNameComplies(file, casing) {
  return isExemptFileName(file) || fittingCasings(fileNameParts(file).base).includes(casing);
}

function fileNameVote(text, file) {
  if (file === undefined || isExemptFileName(file)) {
    return undefined;
  }
  const fitting = fittingCasings(fileNameParts(file).base);
  return fitting.length === 1 ? fitting[0] : undefined;
}

function isOnly(casings, casing) {
  return casings.length === 1 && casings[0] === casing;
}
