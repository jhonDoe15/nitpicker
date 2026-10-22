import { ruleEntry } from '../../../shared/reference/entry.mjs';
import { wordsOfKebab } from '../../../shared/reference/words.mjs';
import dependencyCruiser from '../preset/defaults/dependency-cruiser.config.mjs';

const GUIDE = 'docs/typescript-strict-preset.md';
const TYPESCRIPT_AND_JAVASCRIPT = ['typescript', 'javascript'];
const CRUISER_NOTES = {
  'no-production-to-test': [
    'Production code imports a test file or a file under a test root.',
    'Code that ships must not depend on code that only tests use.',
    'Move what both need to a production module, or keep the import in a test.',
  ],
  'no-production-cycles': [
    'Production modules import each other in a cycle.',
    'A cycle makes modules impossible to load, test or replace one at a time.',
    'Break the cycle: move the shared part to a module both import, or pass the dependency in as a parameter.',
  ],
};
const CRUISER_WHY =
  'dependency-cruiser checks the import graph of the production code against the architecture rules of the strict preset.';
const NO_EXCEPTION_OUTSIDE_ROOTS =
  'It has no exception: move the code under a source root, or add its folder to `layout.sourceRoots`.';

function cruiserEntry({ name, comment }) {
  const [summary, why, allowed] = CRUISER_NOTES[name] ?? [wordsOfKebab(name), CRUISER_WHY, comment];
  const outsideRoots = name === 'no-import-outside-roots';
  return ruleEntry({
    tool: 'dependency-architecture',
    rule: name,
    page: 'typescript-static',
    analyzers: Object.fromEntries(
      TYPESCRIPT_AND_JAVASCRIPT.map((preset) => [preset, ['dependency-architecture']]),
    ),
    summary,
    why,
    allowed,
    docs: [{ label: 'Strict preset guide', path: GUIDE, anchor: 'layout-and-boundaries' }],
    exception: outsideRoots
      ? { note: NO_EXCEPTION_OUTSIDE_ROOTS }
      : { key: 'exceptions', rule: name },
  });
}

const OTHER_ROWS = [
  {
    tool: 'prettier-format',
    rule: 'prettier/prettier',
    summary: 'Lines that Prettier would format differently.',
    why: 'One layout for every file, so that reviews are about the code and not its formatting.',
    allowed: 'Run Prettier on the file; `nitpicker fix` does it for the files a change touched.',
    exception: { key: 'exceptions', rule: 'prettier/prettier' },
  },
  {
    tool: 'typescript-typecheck',
    rule: 'TS<code>',
    pattern: '^TS\\d+$',
    barePattern: true,
    summary: 'A TypeScript compiler error, with the compiler code (`TS2322`).',
    why: 'The project type-checks under the strictest compiler options of the preset.',
    allowed: 'Fix the type error.',
    exception: {
      note: 'A compiler error has no exception: fix the type error. A config entry for one is rejected.',
    },
  },
];

function otherEntry({ tool, ...fields }) {
  return ruleEntry({
    tool,
    page: 'typescript-static',
    analyzers: Object.fromEntries(TYPESCRIPT_AND_JAVASCRIPT.map((preset) => [preset, [tool]])),
    ...fields,
  });
}

/** The entries of the TypeScript and JavaScript checks that are neither ESLint nor in the shared catalog. */
export function staticEntries() {
  return [...dependencyCruiser.forbidden.map(cruiserEntry), ...OTHER_ROWS.map(otherEntry)];
}
