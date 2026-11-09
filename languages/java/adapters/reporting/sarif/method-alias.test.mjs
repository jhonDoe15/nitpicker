import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import { withoutGeneratedSources } from '../../generated/generated-sources.mjs';
import { sarifFindings } from './sarif-reports.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const RULE = 'ForwardingMethodAlias';
const RENAME_RULE = 'ForwardingMethodAliasRename';
const MESSAGE =
  'This method only passes its parameters, in order, to another method of the same class. Call that method directly and delete the alias.';
const RENAME_MESSAGE =
  "This method only passes its parameters, in order, to a less visible method of the same class. Rename that method to this method's name and delete the alias.";
const HAND_WRITTEN = 'src/main/java/shop/Cart.java';
const MAPSTRUCT = 'src/main/java/shop/CartMapperImpl.java';
const BUILD_OUTPUT = 'build/generated/sources/annotationProcessor/java/main/shop/CartImpl.java';

function project(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-method-alias-')));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function pmdResult(root, [file, line, variant = 'direct']) {
  const renamed = variant === 'rename';
  return {
    ruleId: renamed ? RENAME_RULE : RULE,
    message: { text: renamed ? RENAME_MESSAGE : MESSAGE },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: `file://${root}/${file}` },
          region: { startLine: line },
        },
      },
    ],
  };
}

function findingsAt(root, placements) {
  const reportRoot = path.join(root, 'reports');
  mkdirSync(reportRoot, { recursive: true });
  const pmd = {
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'PMD', rules: [] } },
        results: placements.map((placement) => pmdResult(root, placement)),
      },
    ],
  };
  writeFileSync(path.join(reportRoot, 'pmd.sarif'), JSON.stringify(pmd));
  writeFileSync(path.join(reportRoot, 'spotbugs.sarif'), '');
  return sarifFindings({
    projectRoot: root,
    reportRoot,
    roots: [root],
    sourceRoots: ['src/main/java'],
    allSourceRoots: ['src/main/java'],
    manifest: {},
  });
}

const CART = [
  'package shop;',
  '',
  'public class Cart {',
  '  public long total(long cents) {',
  '    return this.sum(cents);',
  '  }',
  '',
  '  public long size(long cents) {',
  '    return this.count(cents);',
  '  }',
  '',
  '  long sum(long cents) {',
  '    return cents;',
  '  }',
  '',
  '  public long count(long cents) {',
  '    return cents;',
  '  }',
  '}',
  '',
].join('\n');
const lineOf = (name) => CART.split('\n').findIndex((line) => line.includes(`long ${name}(`)) + 1;
const MOVED_CART = `// one\n// two\n${CART}`;

const SOURCES = {
  [HAND_WRITTEN]: CART,
  [MAPSTRUCT]:
    'package shop;\n\n@Generated(value = "org.mapstruct.ap.MappingProcessor")\npublic class CartMapperImpl {}\n',
  [BUILD_OUTPUT]: 'package shop;\n\npublic class CartImpl {}\n',
};

describe('ForwardingMethodAlias findings', () => {
  it('keeps the identity when the alias moves and reports a second alias as new', () => {
    const root = project(SOURCES);
    const base = findingsAt(root, [[HAND_WRITTEN, lineOf('total'), 'rename']]);
    writeFileSync(path.join(root, HAND_WRITTEN), MOVED_CART);
    const moved = findingsAt(root, [[HAND_WRITTEN, lineOf('total') + 2, 'rename']]);
    const added = findingsAt(root, [
      [HAND_WRITTEN, lineOf('total') + 2, 'rename'],
      [HAND_WRITTEN, lineOf('size') + 2, 'rename'],
    ]);

    expect(base.map(({ rule, tool }) => [tool, rule])).toEqual([['pmd', RULE]]);
    expect(moved.map(({ identity }) => identity)).toEqual(base.map(({ identity }) => identity));
    const unchanged = compareFindings({ baseFindings: base, headFindings: moved });

    expect([unchanged.newFindings, unchanged.resolvedFindings]).toEqual([[], []]);
    expect(compareFindings({ baseFindings: base, headFindings: added }).newFindings).toHaveLength(
      1,
    );
  });

  it('reports a less visible target under the same rule with the rename message', () => {
    const root = project(SOURCES);
    const found = findingsAt(root, [
      [HAND_WRITTEN, lineOf('total'), 'rename'],
      [HAND_WRITTEN, lineOf('size')],
    ]);

    expect(found.map(({ rule, message }) => [rule, message])).toEqual([
      [RULE, RENAME_MESSAGE],
      [RULE, MESSAGE],
    ]);
  });

  it('is dropped in generated sources, as every Java finding is', () => {
    const root = project(SOURCES);
    const found = findingsAt(root, [
      [HAND_WRITTEN, lineOf('total')],
      [MAPSTRUCT, 6],
      [BUILD_OUTPUT, 3],
    ]);

    expect(found).toHaveLength(3);
    expect(withoutGeneratedSources(found, root).map(({ path: file }) => file)).toEqual([
      HAND_WRITTEN,
    ]);
  });
});
