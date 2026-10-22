import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { applyEdits } from '../fixtures/source.mjs';
import { sha256 } from '../report/canonical.mjs';

export const LOOKUP_FILE = 'core/diff/cache/findings-cache.mjs';
export const LOOKUP_ENTRY = 'lookUpCachedReport';
const RESOLVER = 'resolveAnalyzerMetadata';
export const VARIANT_DIRECTORY = 'reports/flow-model/real/variants';

export const LOOKUP_CONTRACTS = Object.freeze({
  effects: {
    [RESOLVER]: {
      entity: { arg: 0 },
      outcomes: [
        { name: 'resolved', result: 'success' },
        { name: 'throws', result: 'ambiguous' },
      ],
    },
    'cache.read': {
      entity: { arg: 0 },
      outcomes: [
        { name: 'miss', result: 'success' },
        { name: 'hit', result: 'success', returns: 'opaque' },
      ],
    },
  },
  prerequisites: [
    { id: 'resolve-before-read', effect: 'cache.read', requires: { effect: RESOLVER } },
  ],
});

export const LOOKUP_INPUTS = Object.freeze({
  cache: 'effects',
  analyzer: 'object',
  resolveContext: { strict: { oneOf: [true, false] } },
});

const RESOLVE = `    ${RESOLVER}(analyzer, resolveContext);\n`;
const TRY_BLOCK = `  try {\n${RESOLVE}  } catch (error) {\n    return { kind: 'unresolved', error };\n  }\n`;
const READ = '  const report = cache.read(analyzer);\n';
const CATCH_RETURN = "    return { kind: 'unresolved', error };\n";
const READ_BEFORE = 'resolve-before-read|cache.read|analyzer';

const SEEDED = [
  ['seed-omit-resolution', [[TRY_BLOCK, '']]],
  ['seed-read-before-resolution', [[TRY_BLOCK + READ, READ + TRY_BLOCK]]],
  ['seed-wrong-object', [[RESOLVE, `    ${RESOLVER}(resolveContext, analyzer);\n`]]],
  ['seed-continue-after-failure', [[CATCH_RETURN, '    analyzer.unresolved = error;\n']]],
  [
    'seed-conditional-resolution',
    [[RESOLVE, `    if (resolveContext.strict) {\n  ${RESOLVE}    }\n`]],
  ],
];

const UNSUPPORTED = [
  [
    'unsupported-unknown-recovery',
    [[CATCH_RETURN, `    recoverMetadata(analyzer, error);\n${CATCH_RETURN}`]],
    'unknown-call',
  ],
  [
    'unsupported-alias-dispatch',
    [[READ, '  const read = cache.read;\n  const report = read(analyzer);\n']],
    'unknown-dispatch',
  ],
  [
    'unsupported-repeated-read',
    [
      [
        READ,
        '  let report;\n  for (const attempt of [1, 2]) {\n    report = cache.read(analyzer);\n  }\n',
      ],
    ],
    'loop',
  ],
];

const INVERTED_GUARD = [['report === undefined ?', 'report !== undefined ?']];

function variant(text, { name, kind, edits, expect }) {
  const file = kind === 'unchanged' ? LOOKUP_FILE : `${VARIANT_DIRECTORY}/${name}.mjs`;
  return { name, kind, file, entry: LOOKUP_ENTRY, text: applyEdits(text, edits), expect };
}

export function lookupVariants(text) {
  const clean = { status: 'complete', violations: [], reasons: [] };
  return [
    variant(text, { name: 'unchanged', kind: 'unchanged', edits: [], expect: clean }),
    ...SEEDED.map(([name, edits]) =>
      variant(text, {
        name,
        kind: 'seeded',
        edits,
        expect: { ...clean, violations: [READ_BEFORE] },
      }),
    ),
    variant(text, {
      name: 'head-inverted-guard',
      kind: 'diff',
      edits: INVERTED_GUARD,
      expect: clean,
    }),
    ...UNSUPPORTED.map(([name, edits, reason]) =>
      variant(text, {
        name,
        kind: 'unsupported',
        edits,
        expect: { status: 'partial', violations: [], reasons: [reason] },
      }),
    ),
  ];
}

export function functionText(text, name) {
  const sourceFile = ts.createSourceFile(LOOKUP_FILE, text, ts.ScriptTarget.ES2022, true);
  const declaration = sourceFile.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  return declaration?.getText(sourceFile);
}

export function readLookupSource(root) {
  const text = readFileSync(new URL(LOOKUP_FILE, root), 'utf8');
  const entryText = functionText(text, LOOKUP_ENTRY);
  if (entryText === undefined) {
    throw new Error(`flow-model: ${LOOKUP_ENTRY} no longer exists in ${LOOKUP_FILE}`);
  }
  return { text, fileSha256: sha256(text), entrySha256: sha256(entryText) };
}
