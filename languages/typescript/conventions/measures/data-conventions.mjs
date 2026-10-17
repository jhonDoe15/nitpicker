import { indentationStyle, winner } from '../layout-measures.mjs';

const TWO = 2;
const FOUR = 4;
const SECTION_OPENER = /^(?<indent>\s*)(?![-#\s])[^#]*:\s*$/;

export const DATA_CONVENTIONS = [
  {
    id: 'prettier.jsonIndentation',
    label: 'JSON indentation',
    options: ['2', '4', 'tab'],
    optionLabels: { 2: '2 spaces', 4: '4 spaces', tab: 'tabs' },
    fallback: '2',
    files: ['**/*.json'],
    scope: 'formatted-data',
    measure: indentationStyle,
  },
  {
    id: 'prettier.yamlIndentation',
    label: 'YAML indentation',
    options: ['2', '4'],
    optionLabels: { 2: '2 spaces', 4: '4 spaces' },
    fallback: '2',
    files: ['**/*.{yaml,yml}'],
    scope: 'formatted-data',
    measure: yamlIndentation,
  },
];

const DATA_KINDS = {
  json: { id: 'prettier.jsonIndentation', extension: /\.json$/ },
  yaml: { id: 'prettier.yamlIndentation', extension: /\.ya?ml$/ },
};

export function dataFileKind(relativePath) {
  return Object.keys(DATA_KINDS).find((kind) => DATA_KINDS[kind].extension.test(relativePath));
}

export function dataConventionOptions(kind, conventions = {}, { followed = false } = {}) {
  const definition = DATA_CONVENTIONS.find(({ id }) => id === DATA_KINDS[kind].id);
  const value = conventions[definition.id] ?? (followed ? definition.fallback : undefined);
  if (value === undefined) {
    return {};
  }
  return value === 'tab' ? { useTabs: true } : { useTabs: false, tabWidth: Number(value) };
}

function yamlIndentation(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '' && !/^\s*#/.test(line));
  const steps = lines.slice(0, -1).flatMap((line, index) => {
    const opener = SECTION_OPENER.exec(line);
    const next = lines[index + 1];
    return opener === null
      ? []
      : [next.length - next.trimStart().length - opener.groups.indent.length];
  });
  return winner({
    2: steps.filter((step) => step === TWO).length,
    4: steps.filter((step) => step === FOUR).length,
  });
}
