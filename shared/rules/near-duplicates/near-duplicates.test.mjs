import { describe, expect, it } from 'vitest';
import { COPIES } from '../../near-duplicates/test-support/copies.mjs';
import { javascriptUnits } from '../../near-duplicates/test-support/javascript.mjs';
import { exceptionHint } from '../exceptions.mjs';
import { sharedFactFindings } from '../facts/evaluate.mjs';
import { nearDuplicateFindings } from './near-duplicates.mjs';

const RULE = 'near-duplicate';
const RENAMED = `function loadOrders(store, query) {
  const rows = store.select('orders', query.filter, query.limit);
  const visible = rows.filter((row) => row.visible && !row.archived);
  audit.record('orders', visible.length, query.user);
  return visible.map((row) => ({ id: row.id, total: row.total, owner: row.owner }));
}

function loadInvoices(db, request) {
  const items = db.select('orders', request.filter, request.limit);
  const shown = items.filter((item) => item.visible && !item.archived);
  audit.record('orders', shown.length, request.user);
  return shown.map((item) => ({ id: item.id, total: item.total, owner: item.owner }));
}
`;
const FILE = 'src/copies.js';

function unitsOf(text = COPIES, { file = FILE, tokens = 10 } = {}) {
  return javascriptUnits(text, { file }).map(({ file: unitFile, name, start, end, tree }) => ({
    file: unitFile,
    name,
    start,
    end,
    tokens,
    tree,
  }));
}

function findings(units, isExcepted = () => false) {
  return nearDuplicateFindings(units, { analyzerName: 'reuse', isExcepted });
}

function messageOf(name) {
  return findings(unitsOf()).find(({ symbol }) => symbol === name).message;
}

function hint() {
  return exceptionHint(RULE, FILE);
}

describe('near-duplicate over near-duplicate units', () => {
  it('reports each pair once, at the copy that sorts last, with the pair as its identity', () => {
    expect(
      findings(unitsOf()).map(({ rule, path, identity, symbol, location }) => [
        rule,
        path,
        identity,
        symbol,
        location.line,
      ]),
    ).toEqual([
      [RULE, FILE, `${RULE}:${FILE}#addWeights|${FILE}#sumWeights`, 'sumWeights', 34],
      [RULE, FILE, `${RULE}:${FILE}#alignBottom|${FILE}#alignTop`, 'alignTop', 22],
      [RULE, FILE, `${RULE}:${FILE}#jwkMiddleware|${FILE}#jwtMiddleware`, 'jwtMiddleware', 54],
      [RULE, FILE, `${RULE}:${FILE}#readUri|${FILE}#readUrl`, 'readUrl', 1],
    ]);
  });

  it('names the other copy and says it differs only in renamed names', () => {
    expect(messageOf('sumWeights')).toBe(
      `sumWeights is a copy of addWeights (${FILE}:43) apart from renamed names. Keep one, and call it from both places. ${hint()}`,
    );
  });

  it('lists the differing values from the side of the copy it reports', () => {
    expect(messageOf('alignTop')).toBe(
      `alignTop is a copy of alignBottom (${FILE}:28) apart from 3 values ('labels.alignTop' / 'labels.alignBottom', AlignTopIcon / AlignBottomIcon and 'CtrlOrCmd+Shift+Up' / 'CtrlOrCmd+Shift+Down'). Extract one function that takes the differing values as parameters, and call it from both places. ${hint()}`,
    );
    expect(messageOf('readUrl')).toBe(
      `readUrl is a copy of readUri (${FILE}:10) apart from 1 value (URL / URI). Extract one function that takes the differing values as parameters, and call it from both places. ${hint()}`,
    );
  });

  it('gives the lines of a shared run on both sides', () => {
    expect(messageOf('jwtMiddleware')).toBe(
      `jwtMiddleware is a copy of jwkMiddleware (${FILE}:65) in lines 58-61 here and 67-70 there. Extract lines 58-61 into one function, and call it from both places. ${hint()}`,
    );
  });

  it('leaves out a pair when either file is excepted', () => {
    const units = [
      ...unitsOf(COPIES.split('\n').slice(0, 20).join('\n'), { file: 'src/url.js' }),
      ...unitsOf(),
    ].filter(({ name, file }) => name !== 'readUri' || file === FILE);
    const excepted = (rule, file) => rule === RULE && file === 'src/url.js';

    const pair = `${RULE}:${FILE}#readUri|src/url.js#readUrl`;
    const identities = findings(units).map(({ identity }) => identity);

    expect(identities.filter((identity) => identity === pair)).toEqual([pair]);
    expect(findings(units, excepted).map(({ identity }) => identity)).toEqual(
      identities.filter((identity) => !identity.includes('src/url.js')),
    );
  });

  it('leaves large copies that differ in names and literals to the clone analyzer, not rewritten ones', () => {
    const large = { tokens: 100 };

    expect(findings(unitsOf(RENAMED)).map(({ symbol }) => symbol)).toEqual(['loadOrders']);
    expect(findings(unitsOf(RENAMED, large))).toEqual([]);
    const literals = RENAMED.replaceAll("'orders'", "'invoices'").replace("'invoices'", "'orders'");

    expect(findings(unitsOf(COPIES, large)).map(({ symbol }) => symbol)).toEqual([
      'sumWeights',
      'jwtMiddleware',
      'readUrl',
    ]);
    expect(findings(unitsOf(literals))).toHaveLength(1);
    expect(findings(unitsOf(literals, large))).toEqual([]);
  });

  it('leaves out the platform variants of one declaration in Kotlin Multiplatform source sets', () => {
    const [readUri, readUrl] = unitsOf().filter(({ name }) => name.startsWith('readUr'));
    const placed = (unit, file) => ({ ...unit, file, name: 'read' });
    const platform = (set) => `core/src/${set}Main/kotlin/net/Read.kt`;
    const identities = (pair) => findings(pair).map(({ identity }) => identity);

    expect(
      identities([placed(readUri, platform('jvm')), placed(readUrl, platform('native'))]),
    ).toEqual([]);
    expect(
      identities([
        { ...readUri, file: 'core/src/jvmMain/kotlin/net/Uri.kt' },
        { ...readUrl, file: 'core/src/nativeMain/kotlin/net/Url.kt' },
      ]),
    ).toHaveLength(1);
    expect(
      identities([
        placed(readUri, platform('common')),
        placed(readUrl, `web/${platform('common')}`),
      ]),
    ).toEqual([
      `${RULE}:core/src/commonMain/kotlin/net/Read.kt#read|web/core/src/commonMain/kotlin/net/Read.kt#read`,
    ]);
  });

  it('runs over the facts of a registered language and applies the policy exceptions', () => {
    const facts = {
      modules: [{ file: FILE, role: 'production' }],
      nearDuplicateUnits: unitsOf(),
    };
    const options = { language: 'java', analyzerName: 'reuse', rules: [RULE] };
    const policy = { exceptions: [{ rule: RULE, paths: ['src/**'], reason: 'generated' }] };

    expect(sharedFactFindings(facts, options)).toHaveLength(4);
    expect(sharedFactFindings(facts, { ...options, policy })).toEqual([]);
  });

  it('rejects a unit without a tree', () => {
    const [unit] = unitsOf();
    const facts = {
      modules: [{ file: FILE, role: 'production' }],
      nearDuplicateUnits: [{ ...unit, tree: {} }],
    };

    expect(() =>
      sharedFactFindings(facts, { language: 'java', analyzerName: 'reuse', rules: [RULE] }),
    ).toThrow(/facts\.nearDuplicateUnits\[0\]\.tree is \{\}/u);
  });
});
